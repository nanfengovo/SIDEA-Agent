import asyncio
import json
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agent.graph import create_agent_for_skill
from infra.logging.structured_logger import get_structured_logger
from infra.database import get_connection

logger = get_structured_logger("api.routes.chat")
router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    skill_id: str = "plc_diagnostics"
    thread_id: str = "default_session"
    attachments: list = []
    thinking_depth: str = "auto"
    context_length: str = "8k"

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "中文"

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """
    SSE 流式对话接口。
    同时下发大模型的输出增量 (token) 和执行步骤的事件流 (tool_call 等)。
    """
    config = {"configurable": {"thread_id": req.thread_id}}
    
    # --- Save user message to DB ---
    try:
        with get_connection("database/SIDEA.db") as conn:
            # Upsert session
            conn.execute("INSERT OR IGNORE INTO chat_sessions (session_id, title) VALUES (?, ?)", (req.thread_id, req.message[:20]))
            # Update title if it's the first message? Not strictly necessary.
            import uuid
            conn.execute("INSERT INTO chat_messages (message_id, session_id, role, content) VALUES (?, ?, ?, ?)", 
                         (str(uuid.uuid4()), req.thread_id, "user", req.message))
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to save user message to DB: {e}")

    async def event_generator():
        import uuid
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        
        full_agent_reply = ""
        
        try:
            logger.info("Initializing AsyncSqliteSaver...")
            async with AsyncSqliteSaver.from_conn_string("checkpoints.sqlite") as saver:
                logger.info(f"Creating agent for skill {req.skill_id}...")
                agent = await create_agent_for_skill(req.skill_id, checkpointer=saver)
                
                content_list = []
                
                sys_prompt = ""
                if req.thinking_depth == "deep":
                    sys_prompt += "[System: User requested deep reasoning. Please analyze the problem step by step thoroughly before giving a conclusion.]\\n"
                elif req.thinking_depth == "fast":
                    sys_prompt += "[System: User requested fast response. Please skip long chain of thought and give the final answer concisely.]\\n"
                
                if req.context_length == "8k":
                    sys_prompt += "[System: Context length constrained to 8K. Be brief and concise.]\\n"
                elif req.context_length == "128k":
                    sys_prompt += "[System: Context length extended to 128K. You may provide highly detailed and expansive analysis.]\\n"
                
                if sys_prompt:
                    content_list.append({"type": "text", "text": sys_prompt})
                
                if req.message:
                    content_list.append({"type": "text", "text": req.message})
                    
                for url in req.attachments:
                    from pathlib import Path
                    filename = url.split("/")[-1]
                    local_path = Path("uploads") / filename
                    if not local_path.exists():
                        continue
                        
                    parse_event_start = {"id": uuid.uuid4().hex, "type": "tool_start", "data": {"name": "FileParser", "input": filename, "message": f"正在读取附件: {filename}"}}
                    yield f"data: {json.dumps(parse_event_start, ensure_ascii=False)}\n\n"
                        
                    if any(url.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"]):
                        import base64
                        with open(local_path, "rb") as img_file:
                            encoded_string = base64.b64encode(img_file.read()).decode('utf-8')
                        content_list.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded_string}"}})
                    elif url.lower().endswith(".pdf"):
                        try:
                            import PyPDF2
                            with open(local_path, "rb") as pdf_file:
                                reader = PyPDF2.PdfReader(pdf_file)
                                total_pages = len(reader.pages)
                            
                            sys_directive = f"""
[系统强制指令：用户上传了长篇 PDF 文档 '{filename}' (相对路径: 'uploads/{filename}'，共 {total_pages} 页)。
作为智能体，你必须主动使用 `read_document` 工具来阅读此文档。
由于上下文限制，绝对不能一次性读取全部页码。你必须自主规划阅读策略：
1. 每次调用工具读取 5 到 10 页（例如 start_page=1, end_page=5）。
2. 阅读后，在内部分析总结这一段的内容。
3. 如果未读完，继续调用工具阅读下一段（例如 start_page=6, end_page=10），直到涵盖用户所需的信息或全书。
用户只会发出如“总结这份文件”的简单指令，请自主完成多次翻页阅读的过程，无需向用户索要页码！]
"""
                            content_list.append({"type": "text", "text": sys_directive})
                        except Exception as e:
                            logger.error(f"Failed to read PDF {filename}: {e}")
                            content_list.append({"type": "text", "text": f"\n\n[PDF附件 - {filename} 解析失败]\n"})
                    else:
                        content_list.append({"type": "text", "text": f"\n\n[系统提示：用户上传了附件文本 '{filename}'。请使用 read_file 工具来阅读它的内容。相对路径为: uploads/{filename}]\n"})
                        
                    parse_event_end = {"id": uuid.uuid4().hex, "type": "tool_end", "data": {"name": "FileParser", "output": "解析成功", "message": "附件处理完毕"}}
                    yield f"data: {json.dumps(parse_event_end, ensure_ascii=False)}\n\n"
                
                final_content = content_list if len(content_list) > 1 else req.message
                inputs = {"messages": [HumanMessage(content=final_content)]}
                logger.info("Starting astream_events...")
                async for event in agent.astream_events(inputs, config=config, version="v2"):
                    if await request.is_disconnected():
                        logger.warning("Client disconnected")
                        break
                        
                    kind = event["event"]
                    name = event.get("name", "")
                    
                    out_event = None
                    
                    if kind == "on_chat_model_start":
                        out_event = {"id": uuid.uuid4().hex, "type": "llm_start", "data": {"message": "模型开始思考..."}}
                    elif kind == "on_chat_model_stream":
                        chunk = event["data"]["chunk"]
                        token = chunk.content if hasattr(chunk, "content") else str(chunk)
                        if token:
                            full_agent_reply += token
                            out_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": token}}
                    elif kind == "on_chat_model_end":
                        out_event = {"id": uuid.uuid4().hex, "type": "llm_end", "data": {"message": "模型思考结束"}}
                    elif kind == "on_tool_start":
                        tool_input = event["data"].get("input", "")
                        out_event = {"id": uuid.uuid4().hex, "type": "tool_start", "data": {"name": name, "input": str(tool_input), "message": f"正在调用工具: {name}"}}
                    elif kind == "on_tool_end":
                        tool_output = event["data"].get("output", "")
                        out_event = {"id": uuid.uuid4().hex, "type": "tool_end", "data": {"name": name, "output": str(tool_output), "message": "工具调用完成"}}
                    elif kind == "on_tool_error":
                        error = event["data"].get("error", "")
                        out_event = {"id": uuid.uuid4().hex, "type": "tool_error", "data": {"name": name, "error": str(error), "message": "工具执行发生异常"}}
                    
                    if out_event:
                        yield f"data: {json.dumps(out_event, ensure_ascii=False)}\n\n"
                logger.info("Stream events completed normally")
                
                # --- Save agent message to DB ---
                if full_agent_reply:
                    try:
                        with get_connection("database/SIDEA.db") as conn:
                            conn.execute("INSERT INTO chat_messages (message_id, session_id, role, content) VALUES (?, ?, ?, ?)", 
                                         (str(uuid.uuid4()), req.thread_id, "agent", full_agent_reply))
                            conn.commit()
                    except Exception as e:
                        logger.error(f"Failed to save agent message to DB: {e}")
                        
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error("Agent execution error", extra={"error": str(e)})
            err_event = {"id": "error", "type": "error", "data": {"message": str(e)}}
            yield f"data: {json.dumps(err_event, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/chat/translate")
async def translate_stream(req: TranslateRequest, request: Request):
    async def event_generator():
        try:
            from agent.graph import _get_llm
            from infra.config_store import ConfigStore
            from langchain_core.messages import SystemMessage, HumanMessage
            
            config_store = ConfigStore("config.db")
            llm = _get_llm(config_store)
            
            prompt = f"Please translate the following text to {req.target_lang}. Only return the translated text without any explanation, markdown blocks, or original text."
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=req.text)
            ]
            
            async for chunk in llm.astream(messages):
                if await request.is_disconnected():
                    break
                if chunk.content:
                    yield f"data: {json.dumps({'token': chunk.content}, ensure_ascii=False)}\n\n"
                    
            yield f"data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
