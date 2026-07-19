import asyncio
import json
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agent.graph import create_agent_for_skill
from infra.logging.structured_logger import get_structured_logger
from infra.database import get_connection
from infra.interaction_metrics import (
    build_run_summary,
    ensure_metrics_schema,
    estimate_complexity,
    extract_usage_from_llm_output,
    save_interaction_metric,
)
import time

logger = get_structured_logger("api.routes.chat")
router = APIRouter()

# 启动时确保指标表存在
try:
    ensure_metrics_schema()
except Exception:
    pass

class ChatRequest(BaseModel):
    message: str
    skill_id: str = "plc_diagnostics"
    thread_id: str = "default_session"
    attachments: list = []
    thinking_depth: str = "auto"
    context_length: str = "8k"
    use_knowledge_base: bool = False
    permission_mode: str = "ask_always"  # ask_always, ask_risky, full_access
    # auto=大屏类自动走目标拆分；goal=强制目标拆分；react=传统自由工具调用
    execution_mode: str = "auto"

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "中文"

class ApproveRequest(BaseModel):
    approval_id: str
    approved: bool

class GlobalApprovalManager:
    pending_approvals = {}

@router.post("/chat/approve")
async def approve_tool(req: ApproveRequest):
    if req.approval_id in GlobalApprovalManager.pending_approvals:
        GlobalApprovalManager.pending_approvals[req.approval_id]["approved"] = req.approved
        GlobalApprovalManager.pending_approvals[req.approval_id]["event"].set()
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Approval request not found")

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request, background_tasks: BackgroundTasks):
    """
    SSE 流式对话接口。
    同时下发大模型的输出增量 (token) 和执行步骤的事件流 (tool_call 等)。
    """
    config = {"configurable": {"thread_id": req.thread_id}}
    
    # --- Save user message to DB ---
    try:
        ensure_metrics_schema()
        with get_connection("database/SIDEA.db") as conn:
            # Upsert session
            conn.execute("INSERT OR IGNORE INTO chat_sessions (session_id, title) VALUES (?, ?)", (req.thread_id, req.message[:20]))
            # Update title if it's the first message? Not strictly necessary.
            import uuid
            import json as _json
            conn.execute("INSERT INTO chat_messages (message_id, session_id, role, content, attachments) VALUES (?, ?, ?, ?, ?)",
                         (str(uuid.uuid4()), req.thread_id, "user", req.message,
                          _json.dumps(req.attachments, ensure_ascii=False) if req.attachments else None))
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to save user message to DB: {e}")

    async def event_generator():
        import uuid
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        
        full_agent_reply = ""
        
        if req.context_length == "128k":
            num_ctx = 131072
        elif req.context_length == "32k":
            num_ctx = 32768
        else:
            num_ctx = 8192
        
        try:
            logger.info("Initializing AsyncSqliteSaver...")
            async with AsyncSqliteSaver.from_conn_string("checkpoints.sqlite") as saver:
                logger.info(f"Creating agent for skill {req.skill_id}...")
                sse_queue = asyncio.Queue()
                
                def _build_tool_wrapper(queue, mode):
                    def wrapper(tool):
                        original_func = getattr(tool, "func", None)
                        original_coro = getattr(tool, "coroutine", None)
                        
                        async def wrapped_coro(*args, **kwargs):
                            tool_name = tool.name
                            needs_approval = False
                            if mode == "approval" and tool_name not in ["search_knowledge_base", "run_python_in_sandbox", "generate_image"]:
                                approval_id = uuid.uuid4().hex
                                event = asyncio.Event()
                                GlobalApprovalManager.pending_approvals[approval_id] = {
                                    "event": event,
                                    "approved": False
                                }
                                
                                await queue.put({
                                    "id": uuid.uuid4().hex,
                                    "type": "approval_request",
                                    "data": {
                                        "approval_id": approval_id,
                                        "tool_name": tool_name,
                                        "input": str(kwargs) if kwargs else str(args),
                                        "message": f"操作需人工审批: {tool_name}"
                                    }
                                })
                                
                                await event.wait()
                                result = GlobalApprovalManager.pending_approvals.pop(approval_id, None)
                                if result and not result.get("approved"):
                                    return "❌ 权限拒绝：用户驳回了此操作请求。已停止后续操作。"
                                    
                            if original_coro:
                                return await original_coro(*args, **kwargs)
                            else:
                                loop = asyncio.get_event_loop()
                                return await loop.run_in_executor(None, lambda: original_func(*args, **kwargs))
                        
                        tool.coroutine = wrapped_coro
                        return tool
                    return wrapper

                extra_tools = []
                if req.use_knowledge_base:
                    from langchain_core.tools import StructuredTool
                    from pydantic import BaseModel, Field
                    class KBSearchArgs(BaseModel):
                        query: str = Field(..., description="要查询的知识内容或故障现象关键词")
                        
                    def _search_kb(query: str) -> str:
                        try:
                            import api.routes.knowledge as knowledge
                            knowledge.init_chroma()
                            query_embedding = knowledge.embeddings.embed_query(query)
                            results = knowledge.collection.query(
                                query_embeddings=[query_embedding],
                                n_results=3
                            )
                            retrieved_docs = results["documents"][0] if results["documents"] else []
                            if retrieved_docs:
                                return "【知识库搜索结果】:\n" + "\n\n".join(retrieved_docs)
                            return "知识库中未找到相关内容。"
                        except Exception as e:
                            logger.error(f"RAG retrieval failed: {e}")
                            return f"知识库检索失败: {e}"
                            
                    extra_tools.append(StructuredTool.from_function(
                        func=_search_kb,
                        name="search_knowledge_base",
                        description="在企业内部知识库、设备手册和历史故障工单中检索相关信息。当你遇到不确定的特定设备代码、操作手册或需要查找历史经验时，调用此工具。",
                        args_schema=KBSearchArgs
                    ))
                

                is_autofix = "[系统异常拦截]" in req.message

                trace_events = []
                tools_called: list[str] = []
                token_usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
                run_started_ms = int(time.time() * 1000)
                # 本轮工具真实产出的图表 / 图片 URL（用于最终交付兜底）
                produced_chart_urls: list[str] = []
                produced_image_urls: list[str] = []
                
                # Push a session_info trace event for the frontend
                session_info = {
                    "id": uuid.uuid4().hex,
                    "type": "session_info",
                    "timestamp": run_started_ms,
                    "data": {
                        "session_id": req.thread_id,
                        "skill_id": req.skill_id,
                        "message": "会话上下文初始化"
                    }
                }
                trace_events.append(session_info)
                await sse_queue.put(session_info)

                # ---- 目标拆分模式（小模型友好）：大屏 → 布局/数据/导出/解读 ----
                from agent.goal_pipeline import should_run_goal_dashboard, run_dashboard_goal
                use_goal = should_run_goal_dashboard(req.message, req.execution_mode)
                if use_goal:
                    # session_info 已入 queue，目标模式不消费 queue，这里直接下发
                    yield f"data: {json.dumps(session_info, ensure_ascii=False)}\n\n"
                    logger.info(f"Goal mode dashboard pipeline engaged (execution_mode={req.execution_mode})")
                    from agent.graph import _get_llm
                    from infra.config_store import ConfigStore as _CS
                    goal_llm = _get_llm(_CS("config.db"), num_ctx=min(num_ctx, 16384))
                    async for gev in run_dashboard_goal(
                        req.message,
                        llm=goal_llm,
                        attachments=req.attachments or [],
                    ):
                        if gev.get("type") == "_goal_meta":
                            meta = gev.get("data") or {}
                            for n in meta.get("tools_called") or []:
                                if n not in tools_called:
                                    tools_called.append(n)
                            u = meta.get("url")
                            if u and u not in produced_chart_urls:
                                produced_chart_urls.append(u)
                            continue
                        if gev.get("type") == "llm_token":
                            tok = (gev.get("data") or {}).get("token") or ""
                            full_agent_reply += tok
                        elif gev.get("type") in ("tool_start", "tool_end", "tool_error"):
                            trace_events.append(gev)
                            n = (gev.get("data") or {}).get("name")
                            if gev.get("type") == "tool_start" and n and n not in tools_called:
                                tools_called.append(n)
                        yield f"data: {json.dumps(gev, ensure_ascii=False)}\n\n"
                    logger.info("Goal mode pipeline completed")
                else:
                    agent = await create_agent_for_skill(req.skill_id, checkpointer=saver, num_ctx=num_ctx, extra_tools=extra_tools, tool_wrapper=_build_tool_wrapper(sse_queue, req.permission_mode), force_tool=is_autofix, sse_queue=sse_queue)
                
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
                    
                    for url in req.attachments:
                        from pathlib import Path
                        filename = url.split("/")[-1]
                        local_path = Path("uploads") / filename
                        if not local_path.exists():
                            continue
                            
                        parse_event_start = {"id": uuid.uuid4().hex, "type": "tool_start", "data": {"name": "FileParser", "input": filename, "message": f"正在读取附件: {filename}"}}
                        trace_events.append(parse_event_start)
                        await sse_queue.put(parse_event_start)
                            
                        if any(url.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"]):
                            import base64
                            with open(local_path, "rb") as img_file:
                                encoded_string = base64.b64encode(img_file.read()).decode('utf-8')
                            
                            mime = "image/jpeg"
                            if url.lower().endswith(".png"): mime = "image/png"
                            elif url.lower().endswith(".gif"): mime = "image/gif"
                            elif url.lower().endswith(".webp"): mime = "image/webp"
                                
                            content_list.append({
                                "type": "image_url", 
                                "image_url": {
                                    "url": f"data:{mime};base64,{encoded_string}",
                                    "detail": "high"
                                }
                            })
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
                            file_size = local_path.stat().st_size
                            sys_txt = ""
                            try:
                                with open(local_path, "r", encoding="utf-8") as f:
                                    preview = f.read(4000)
                                sys_txt = f"\n\n[系统提示]：用户上传了大小为 {file_size} 字节的文件 '{filename}'。以下是该文件的前 4000 个字符预览：\n\n```text\n{preview}\n...\n```\n\n请**直接基于以上文件内容**回答用户当前的提问（如“分析错误”等）。不需要任何多余的寒暄！如果你觉得信息不够，你可以自主调用 `read_document` 翻页阅读。"
                            except Exception as e:
                                sys_txt = f"\n\n[系统强制指令]：用户上传了大小为 {file_size} 字节的文件 '{filename}'。你**必须第一步**调用 `read_document` 工具（参数 filepath='uploads/{filename}', start_page=1, end_page=1）来读取它，不要回复任何其他说明，直接调用工具！"
                            
                            content_list.append({"type": "text", "text": sys_txt})
                            
                        parse_event_end = {"id": uuid.uuid4().hex, "type": "tool_end", "data": {"name": "FileParser", "output": "解析成功", "message": "附件处理完毕"}}
                        trace_events.append(parse_event_end)
                        await sse_queue.put(parse_event_end)
                        
                    if req.message:
                        has_image_attachment = any(url.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"] for url in req.attachments)
                        if has_image_attachment:
                            enhanced_message = f"{req.message}\n\n[系统强制指令：用户刚刚上传了一张全新的图片。请**彻底抛弃**前文中对旧图片的分析和结论，**绝对不要**把前文的选项或分析套用到本题上。请重新、仔细地审视这张最新图片的所有细节，并仅针对本次的图片回答！]"
                            content_list.append({"type": "text", "text": enhanced_message})
                        else:
                            content_list.append({"type": "text", "text": req.message})
                    
                    # 合并纯文本内容以防某些本地小模型对 list 格式理解不佳
                    has_image = any(isinstance(c, dict) and c.get("type") == "image_url" for c in content_list)
                    if not has_image and content_list:
                        final_text = ""
                        for c in content_list:
                            final_text += c.get("text", "") + "\n"
                        final_content = final_text.strip()
                    else:
                        final_content = content_list
                    inputs = {"messages": [HumanMessage(content=final_content)]}
                    
                    async def run_agent():
                        try:
                            async for event in agent.astream_events(inputs, config=config, version="v2"):
                                await sse_queue.put(event)
                        except Exception as e:
                            import traceback
                            traceback.print_exc()
                            await sse_queue.put({"event": "error", "data": {"message": str(e)}})
                        finally:
                            await sse_queue.put(None)
                    
                    agent_task = asyncio.create_task(run_agent())
                    logger.info("Started agent task, consuming queue...")
                    
                    while True:
                        if await request.is_disconnected():
                            logger.warning("Client disconnected")
                            agent_task.cancel()
                            break
                            
                        event = await sse_queue.get()
                        if event is None:
                            break
                            
                        if "type" in event and event["type"] in ["session_info", "tool_start", "tool_end", "tool_error", "approval_request"]:
                            # This is our custom event (e.g. from tool_wrapper or initial push)
                            if event["type"] == "tool_start":
                                n = (event.get("data") or {}).get("name")
                                if n and n not in tools_called:
                                    tools_called.append(n)
                            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                            continue
                            
                        kind = event.get("event")
                        name = event.get("name", "")
                        
                        out_event = None
                        
                        if kind == "on_chat_model_start":
                            out_event = {"id": uuid.uuid4().hex, "type": "llm_start", "data": {"message": "模型开始思考..."}}
                        elif kind == "on_chat_model_stream":
                            chunk = event["data"]["chunk"]
                            token = chunk.content if hasattr(chunk, "content") else str(chunk)
                            if token is not None:
                                full_agent_reply += token
                                out_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": token}}
                        elif kind == "on_chat_model_end":
                            usage = extract_usage_from_llm_output(event.get("data", {}).get("output"))
                            token_usage["input_tokens"] += usage.get("input_tokens", 0)
                            token_usage["output_tokens"] += usage.get("output_tokens", 0)
                            token_usage["total_tokens"] += usage.get("total_tokens", 0)
                            out_event = {
                                "id": uuid.uuid4().hex,
                                "type": "llm_end",
                                "data": {
                                    "message": "模型思考结束",
                                    "tokens": usage,
                                },
                            }
                        elif kind == "on_tool_start":
                            tool_input = event["data"].get("input", "")
                            if name and name not in tools_called:
                                tools_called.append(name)
                            out_event = {"id": uuid.uuid4().hex, "type": "tool_start", "data": {"name": name, "input": tool_input, "message": f"正在调用工具: {name}"}}
                        elif kind == "on_tool_end":
                            tool_output = event["data"].get("output", "")
                            # Handle ToolMessage or other objects
                            if hasattr(tool_output, "content"):
                                tool_output = tool_output.content
                            elif not isinstance(tool_output, (str, int, float, bool, list, dict, type(None))):
                                tool_output = str(tool_output)
                            
                            # Intercept sandbox image outputs and render them for the user
                            if name == "run_python_in_sandbox" and "sandbox_workspace/" in str(tool_output):
                                import re
                                from core.public_url import public_url

                                matches = re.findall(r"sandbox_workspace/[a-zA-Z0-9_\-]+\.(?:png|jpg|jpeg|PNG|JPG|JPEG)", str(tool_output))
                                for filepath in set(matches):
                                    filename = filepath.split("/")[-1]
                                    md_image = f"\n\n![{filename}]({public_url(filepath)})\n\n"
                                    full_agent_reply += md_image
                                    img_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": md_image}}
                                    yield f"data: {json.dumps(img_event, ensure_ascii=False)}\n\n"

                            # 记录本轮产出的图表 URL，流结束后兜底强制交付
                            if "sandbox_workspace/chart_" in str(tool_output):
                                import re
                                for u in re.findall(r"https?://[^\s\"'`]+/sandbox_workspace/chart_[0-9]+\.json", str(tool_output)):
                                    if u not in produced_chart_urls:
                                        produced_chart_urls.append(u)
                            if name == "generate_image":
                                import re
                                for u in re.findall(r"https?://[^\s\"'`)\]]+/sandbox_workspace/[^\s\"'`)\]]+\.(?:png|jpg|jpeg)", str(tool_output)):
                                    if u not in produced_image_urls:
                                        produced_image_urls.append(u)
                            
                            out_event = {"id": uuid.uuid4().hex, "type": "tool_end", "data": {"name": name, "output": tool_output, "message": "工具调用完成"}}
                        elif kind == "on_tool_error":
                            error = event["data"].get("error", "")
                            if name and name not in tools_called:
                                tools_called.append(name)
                            out_event = {"id": uuid.uuid4().hex, "type": "tool_error", "data": {"name": name, "error": str(error), "message": "工具执行发生异常"}}
                        elif kind == "error":
                            # From our catch block
                            out_event = {"id": "error", "type": "error", "data": {"message": event["data"]["message"]}}
                        
                        if out_event:
                            if out_event["type"] not in ["llm_token", "llm_start", "llm_end"]:
                                trace_events.append(out_event)
                            yield f"data: {json.dumps(out_event, ensure_ascii=False)}\n\n"
                            
                    logger.info("Stream queue empty, event_generator completed normally")
                
                # NOTE: shared post-processing (empty-reply / delivery / summary) continues below                
                if not full_agent_reply.strip():
                    err_msg = "\n\n⚠️ **[系统警报] 模型输出为空。**\n这通常是因为当前的对话历史总长度**超出了当前设置的上下文窗口限制**。模型被迫截断并输出了结束符。\n\n**建议解决方案：**\n1. 在底部输入框左侧点击 `[上下文: 8K]` 切换到 **128K** 模式扩充窗口空间。\n2. 或者开启一个全新的会话（清空历史记忆）再试一次。"
                    full_agent_reply = err_msg
                    err_token_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": err_msg}}
                    trace_events.append(err_token_event)
                    yield f"data: {json.dumps(err_token_event, ensure_ascii=False)}\n\n"

                # --- 强制交付兜底（Level 2 Defense）---
                # 工具确实产出了图表/图片，但模型的最终回复漏掉了 URL：由系统直接补发，
                # 彻底消灭「代码写了、沙箱跑了、用户却看不到大屏」的断链。
                delivery_parts: list[str] = []
                for u in produced_chart_urls:
                    if u not in full_agent_reply:
                        delivery_parts.append(f"\n\n```echarts-i18n\n{u}\n```\n")
                for u in produced_image_urls:
                    if u not in full_agent_reply:
                        fname = u.split("/")[-1]
                        delivery_parts.append(f"\n\n![{fname}]({u})\n")
                if delivery_parts:
                    delivery_md = (
                        "\n\n---\n**[系统交付兜底] 以下为本轮工具实际生成的结果：**"
                        + "".join(delivery_parts)
                    )
                    full_agent_reply += delivery_md
                    dl_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": delivery_md}}
                    yield f"data: {json.dumps(dl_event, ensure_ascii=False)}\n\n"
                    dl_trace = {
                        "id": uuid.uuid4().hex,
                        "type": "tool_end",
                        "data": {
                            "name": "delivery_guard",
                            "output": f"补发 {len(delivery_parts)} 个遗漏的产物 URL",
                            "message": "系统交付兜底：模型回复缺少产物链接，已自动补发",
                        },
                    }
                    trace_events.append(dl_trace)
                    yield f"data: {json.dumps(dl_trace, ensure_ascii=False)}\n\n"
                else:
                    # 模型抄写了 chart_xxxx 占位符、且本轮根本没产出真实图表
                    import re as _re
                    fake_hits = _re.findall(
                        r"https?://[^\s`\"']+/sandbox_workspace/chart_(?:x+|X+|placeholder|example|demo)[^\s`\"']*",
                        full_agent_reply,
                        flags=_re.I,
                    )
                    # 也匹配没有数字时间戳的 chart_*.json
                    fake_hits += [
                        m for m in _re.findall(
                            r"https?://[^\s`\"']+/sandbox_workspace/chart_[^\s`\"']+\.json",
                            full_agent_reply,
                        )
                        if not _re.search(r"/chart_\d+\.json$", m)
                    ]
                    if fake_hits and not produced_chart_urls:
                        warn = (
                            "\n\n---\n⚠️ **[系统拦截] 检测到伪造的图表链接**（如 `chart_xxxx.json`）。"
                            "本轮未调用沙箱或未成功导出图表，前端无法渲染。"
                            "请**新开对话**并让助手真正调用 `run_python_in_sandbox`；"
                            "若反复出现，请换用更强的工具调用模型。\n"
                        )
                        full_agent_reply += warn
                        warn_event = {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": warn}}
                        yield f"data: {json.dumps(warn_event, ensure_ascii=False)}\n\n"

                # --- Run summary（工具 / 耗时 / 模型 / 角色 / tokens）---
                duration_ms = max(0, int(time.time() * 1000) - run_started_ms)
                from infra.config_store import ConfigStore
                from integrations.llm import get_active_profile
                _ap = get_active_profile(mask_key=True) or {}
                model_name = _ap.get("model_name") or ConfigStore("config.db").get("LLM_MODEL_NAME", "unknown")
                skill_name = req.skill_id
                try:
                    with get_connection("config.db") as cconn:
                        row = cconn.execute(
                            "SELECT skill_name FROM skills WHERE skill_id = ?", (req.skill_id,)
                        ).fetchone()
                        if row:
                            skill_name = row["skill_name"]
                except Exception:
                    pass

                # FileParser 等附件工具也计入
                for te in trace_events:
                    n = (te.get("data") or {}).get("name")
                    if te.get("type") == "tool_start" and n and n not in tools_called:
                        tools_called.append(n)

                complexity = estimate_complexity(
                    user_chars=len(req.message or ""),
                    tool_count=len(tools_called),
                    has_attachment=bool(req.attachments),
                )
                # 若模型未返回 usage，用字符粗估兜底（约 2 字符/token 中英混合）
                if not token_usage["total_tokens"]:
                    approx_out = max(1, len(full_agent_reply) // 2)
                    approx_in = max(1, len(req.message or "") // 2)
                    token_usage = {
                        "input_tokens": approx_in,
                        "output_tokens": approx_out,
                        "total_tokens": approx_in + approx_out,
                    }
                    tokens_estimated = True
                else:
                    tokens_estimated = False

                run_meta = build_run_summary(
                    tools=tools_called,
                    duration_ms=duration_ms,
                    model=model_name,
                    skill_id=req.skill_id,
                    skill_name=skill_name,
                    input_tokens=token_usage["input_tokens"],
                    output_tokens=token_usage["output_tokens"],
                    total_tokens=token_usage["total_tokens"],
                    complexity=complexity,
                )
                run_meta["tokens_estimated"] = tokens_estimated

                summary_event = {
                    "id": uuid.uuid4().hex,
                    "type": "run_summary",
                    "timestamp": int(time.time() * 1000),
                    "data": run_meta,
                }
                trace_events.append(summary_event)
                yield f"data: {json.dumps(summary_event, ensure_ascii=False)}\n\n"
                
                # --- Save agent message to DB ---
                if full_agent_reply:
                    try:
                        msg_id = str(uuid.uuid4())
                        with get_connection("database/SIDEA.db") as conn:
                            ensure_metrics_schema()
                            conn.execute(
                                "INSERT INTO chat_messages (message_id, session_id, role, content, trace_events, run_meta) VALUES (?, ?, ?, ?, ?, ?)",
                                (
                                    msg_id,
                                    req.thread_id,
                                    "agent",
                                    full_agent_reply,
                                    json.dumps(trace_events, ensure_ascii=False),
                                    json.dumps(run_meta, ensure_ascii=False),
                                ),
                            )
                            conn.commit()

                        save_interaction_metric(
                            session_id=req.thread_id,
                            message_id=msg_id,
                            skill_id=req.skill_id,
                            model=model_name,
                            tools=tools_called,
                            duration_ms=duration_ms,
                            input_tokens=token_usage["input_tokens"],
                            output_tokens=token_usage["output_tokens"],
                            total_tokens=token_usage["total_tokens"],
                            complexity=complexity,
                            user_chars=len(req.message or ""),
                        )
                            
                        # B方案：自动触发经验提炼（如果响应较长，具备一定技术含量）
                        if len(full_agent_reply) > 100:
                            from api.routes.knowledge import ExtractRequest, extract_experience
                            extraction_req = ExtractRequest(
                                session_id=req.thread_id,
                                message=f"用户提问: {req.message}\nAI回答: {full_agent_reply}"
                            )
                            # Run it in background task
                            async def trigger_extraction():
                                await extract_experience(extraction_req, background_tasks)
                            # We can't await inside synchronous generator logic, wait this is an async generator.
                            await extract_experience(extraction_req, background_tasks)
                    except Exception as e:
                        logger.error(f"Failed to save agent message to DB or auto-extract: {e}")
                        
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
        import asyncio
        from agent.graph import _get_llm
        from infra.config_store import ConfigStore
        from langchain_core.messages import SystemMessage, HumanMessage

        def _chunk_text(content) -> str:
            if content is None:
                return ""
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for p in content:
                    if isinstance(p, str):
                        parts.append(p)
                    elif isinstance(p, dict) and p.get("text"):
                        parts.append(str(p["text"]))
                    elif hasattr(p, "get") and p.get("text"):
                        parts.append(str(p.get("text")))
                return "".join(parts)
            return str(content)

        try:
            yield f"data: {json.dumps({'type': 'llm_start', 'data': {'target_lang': req.target_lang, 'mode': 'translate'}}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'tool_start', 'data': {'name': 'translate_message', 'target_lang': req.target_lang, 'chars': len(req.text or '')}}, ensure_ascii=False)}\n\n"

            config_store = ConfigStore("config.db")
            llm = _get_llm(config_store)

            prompt = f"""You are a professional translator. Translate the user message into {req.target_lang}.

Rules:
1. Output ONLY the translation — no preface, no explanation, no quotes.
2. Preserve Markdown structure (headings, lists, bold, links).
3. NEVER modify, translate, or remove placeholders like [[SIDEA_BLOCK_0]], [[SIDEA_BLOCK_1]], etc. Copy them exactly as-is.
4. Do not wrap the whole answer in a markdown code fence.
"""
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=req.text),
            ]

            token_count = 0
            # 本地小模型偶发挂起：整体超时保护
            async def _stream():
                nonlocal token_count
                async for chunk in llm.astream(messages):
                    if await request.is_disconnected():
                        break
                    text = _chunk_text(getattr(chunk, "content", None))
                    if text:
                        token_count += len(text)
                        yield f"data: {json.dumps({'type': 'llm_token', 'token': text, 'data': {'token': text}}, ensure_ascii=False)}\n\n"

            try:
                async with asyncio.timeout(90):
                    async for line in _stream():
                        yield line
            except TimeoutError:
                yield f"data: {json.dumps({'type': 'tool_error', 'error': '翻译超时（90s），请重试或改用简中/繁中本地转换', 'data': {'name': 'translate_message', 'message': 'timeout'}}, ensure_ascii=False)}\n\n"
                return

            yield f"data: {json.dumps({'type': 'tool_end', 'data': {'name': 'translate_message', 'target_lang': req.target_lang, 'chars_out': token_count}}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'llm_end', 'data': {'target_lang': req.target_lang}}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'tool_error', 'error': str(e), 'data': {'name': 'translate_message', 'message': str(e)}}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
@router.get("/sandbox/open")
def open_sandbox_folder(file: str = ""):
    """Open the sandbox_workspace folder in the host OS"""
    import os
    import subprocess
    import platform
    
    # Ensure it only opens within sandbox_workspace
    base_dir = os.path.abspath("sandbox_workspace")
    if file:
        target_path = os.path.abspath(os.path.join(base_dir, file))
        if not target_path.startswith(base_dir):
            return {"status": "error", "message": "Invalid path"}
        # If file doesn't exist, fallback to base_dir
        if not os.path.exists(target_path):
            target_path = base_dir
    else:
        target_path = base_dir
        
    try:
        if platform.system() == "Windows":
            os.startfile(target_path)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", "-R", target_path] if os.path.isfile(target_path) else ["open", target_path])
        else:
            subprocess.Popen(["xdg-open", target_path])
        return {"status": "success", "message": f"Opened {target_path}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
