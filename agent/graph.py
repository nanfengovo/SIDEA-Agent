from langchain_core.messages import SystemMessage
from langchain.agents import create_agent
from langchain.agents.middleware import ContextEditingMiddleware, ClearToolUsesEdit
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3

from infra.config_store import ConfigStore
from infra.logging.structured_logger import get_structured_logger
from skills.registry import SkillRegistry
from core.llm_factory import create_llm
from integrations.llm.profile_store import get_active_profile

logger = get_structured_logger("agent.graph")

def _get_llm(config_store: ConfigStore, num_ctx: int = 8192):
    """按 Active LLM Provider Profile 创建 ChatModel（Ollama / OpenAI / Gemini）。"""
    db_path = getattr(config_store, "db_path", "config.db") or "config.db"
    active = get_active_profile(db_path, mask_key=True)
    logger.info(
        "Initializing LLM from profile",
        extra={
            "profile_id": (active or {}).get("profile_id"),
            "provider": (active or {}).get("provider"),
            "model": (active or {}).get("model_name"),
            "num_ctx": num_ctx,
        },
    )
    return create_llm(db_path=db_path, num_ctx=num_ctx)

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite

async def create_agent_for_skill(skill_id: str, db_path: str = "config.db", checkpointer=None, num_ctx: int = 8192, extra_tools: list = None, force_tool: bool = False, sse_queue=None, **kwargs):
    """
    根据 Skill ID 动态创建带有状态记忆的 React Agent Graph。
    - 绑定了对应的原子工具
    - 结合了 SQLite 检查点进行上下文持久化
    """
    config_store = ConfigStore(db_path)
    registry = SkillRegistry(db_path)
    
    try:
        skill_data = registry.load_skill(skill_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Failed to load skill {skill_id}", extra={"error": str(e)})
        # 提供一个退化版本
        skill_data = {
            "system_prompt": "你是一个有用的助手，但是目标技能加载失败。",
            "tools": []
        }
    
    llm = _get_llm(config_store, num_ctx=num_ctx)
    tools = skill_data["tools"]
    if extra_tools:
        tools.extend(extra_tools)
    
    # Apply HITL wrapper if provided
    from typing import Callable, Any
    tool_wrapper: Callable[[Any], Any] = kwargs.get("tool_wrapper")
    if tool_wrapper and tools:
        tools = [tool_wrapper(t) for t in tools]
        
    system_prompt = skill_data["system_prompt"]
    
    # 动态注入可用大屏模版，让 Agent 能够自动匹配最佳模版
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT template_id, name, description FROM dashboard_templates WHERE is_enabled = 1")
        templates = cursor.fetchall()
        if templates:
            tpl_info = "\n\n【系统预置可用大屏模版列表】(推荐在调用 export_dashboard_v2 时，根据用户需求场景选择最合适的 template_id):\n"
            for tpl in templates:
                tpl_info += f"- `{tpl[0]}`: {tpl[1]} - {tpl[2]}\n"
            system_prompt += tpl_info
        conn.close()
    except Exception as e:
        logger.error(f"Failed to load templates for prompt injection: {e}")
    if not tools:
        from langgraph.graph import StateGraph, START, END
        from langgraph.graph.message import add_messages
        from typing import Annotated
        from typing_extensions import TypedDict
        
        class State(TypedDict):
            messages: Annotated[list, add_messages]
            
        from langchain_core.runnables import RunnableConfig
        async def call_model(state: State, config: RunnableConfig):
            sys_msg = SystemMessage(content=system_prompt)
            response = await llm.ainvoke([sys_msg] + state["messages"], config)
            return {"messages": response}
            
        workflow = StateGraph(State)
        workflow.add_node("agent", call_model)
        workflow.add_edge(START, "agent")
        workflow.add_edge("agent", END)
        return workflow.compile(checkpointer=checkpointer)
    
    from langchain.agents.middleware import SummarizationMiddleware, AgentMiddleware, ContextEditingMiddleware, ClearToolUsesEdit
    from langchain_core.messages import HumanMessage, SystemMessage

    # --- 工具摘要构建函数（压缩后用于重注入，防止模型忘记工具）---
    def _build_tool_reminder(tools_list: list) -> str:
        if not tools_list:
            return ""
        lines = ["[系统提醒] 以下工具当前可用，遇到相关问题请主动调用："]
        for t in tools_list:
            desc = getattr(t, "description", "") or ""
            lines.append(f"- `{t.name}`: {desc[:80]}")
        return "\n".join(lines)

    # --- Token 粗估：按平均 4 字符/token 估算，用于触发阈值判断 ---
    def _estimate_tokens(messages: list) -> int:
        total_chars = sum(len(str(getattr(m, 'content', '') or '')) for m in messages)
        return total_chars // 4

    class SmartCompressionMiddleware(AgentMiddleware):
        """基于 Token 估算的智能压缩中间件。
        - 触发条件：历史消息估算 token 数超过上下文窗口 65%
        - 压缩后：自动将工具列表摘要作为 SystemMessage 重注入，防止模型忘记工具
        """
        def __init__(self, sse_queue, tools_ref: list, token_limit: int):
            self.sse_queue = sse_queue
            self.tools_ref = tools_ref
            self.compress_threshold = max(int(token_limit * 0.65), 4096)
            self.clear_threshold = max(int(token_limit * 0.75), 5000)

        async def awrap_model_call(self, request, handler):
            import uuid
            msgs = request.messages or []
            estimated = _estimate_tokens(msgs)

            needs_compress = estimated > self.compress_threshold or len(msgs) > 12

            if needs_compress and self.sse_queue:
                await self.sse_queue.put({
                    "id": uuid.uuid4().hex,
                    "type": "tool_start",
                    "data": {
                        "name": "ContextCompressor",
                        "input": f"历史约 {estimated} tokens / {len(msgs)} 条，超过阈值 {self.compress_threshold}",
                        "message": f"⚠️ 上下文已达 ~{estimated} tokens，正在智能压缩历史记忆..."
                    }
                })

            response = await handler(request)

            if needs_compress and self.sse_queue:
                await self.sse_queue.put({
                    "id": uuid.uuid4().hex,
                    "type": "tool_end",
                    "data": {
                        "name": "ContextCompressor",
                        "output": "压缩完成",
                        "message": "记忆压缩完成！工具定义已自动重注入，确保模型随时可调用。"
                    }
                })

            return response

    # --- 动态阈值（按窗口大小自适应）---
    clear_trigger = max(int(num_ctx * 0.75), 5000)

    middleware_list = [
        SmartCompressionMiddleware(sse_queue, tools, num_ctx),
        SummarizationMiddleware(
            model=llm,
            trigger=[
                ("messages", 12),  # 消息条数兜底（防低 token 估算误差）
            ],
            keep=("messages", 4),  # 保留最近 4 条原文（足够保留完整一轮 tool call 往返）
            summary_prompt=(
                "请极简地总结以下历史对话，**重点保留**：用户核心需求、关键参数/数据、工具调用结果摘要。"
                "省略所有礼貌用语、重复解释和中间过程，输出纯中文，控制在 200 字以内。\n{messages}"
            )
        ),
        ContextEditingMiddleware(
            edits=[
                ClearToolUsesEdit(
                    trigger=clear_trigger,  # 动态阈值，对 8K 本地模型约为 6144 token
                    keep=1,                 # 只保留最近 1 轮工具调用记录
                ),
            ],
        ),
    ]
    
    # 工具执行自动修正拦截器 (Level 1 Defense - 中间件 Output Validator)
    if tools:
        class AutofixMiddleware(AgentMiddleware):
            async def awrap_model_call(self, request, handler):
                is_explicit_autofix = False
                if request.messages:
                    last_msg = request.messages[-1]
                    if hasattr(last_msg, "content") and "[系统异常拦截]" in str(last_msg.content):
                        is_explicit_autofix = True
                        
                # 遇到假执行时最多重试 3 次
                for attempt in range(3):
                    response = await handler(request)
                    ai_msg = response.result[0] if (response and response.result) else None
                    
                    if ai_msg and not getattr(ai_msg, "tool_calls", None):
                        # 判断是否需要强制重试
                        needs_retry = is_explicit_autofix
                        
                        # 隐式自动拦截：上一步是工具报错，但大模型试图装作成功输出文本（无 tool_calls）
                        if not needs_retry and request.messages:
                            last_req_msg = request.messages[-1]
                            # 如果最后一条消息是工具执行结果，且包含报错特征（例如 "❌"）
                            if getattr(last_req_msg, "type", "") == "tool" and "❌" in str(getattr(last_req_msg, "content", "")):
                                needs_retry = True
                                
                        if needs_retry:
                            # 将失败的输出加入上下文，并追加强烈的系统警告，强制其重新生成
                            new_messages = list(request.messages)
                            new_messages.append(ai_msg)
                            new_messages.append(HumanMessage(content="[System] INVALID. Tool execution failed in the previous step, or you outputted invalid text. You MUST output a tool call JSON with FIXED arguments to retry. Do NOT output markdown or plain text until the tool succeeds."))
                            request = request.override(messages=new_messages)
                            continue
                            
                    return response
                return response
                
        # 将拦截器插入中间件列表的最前面
        middleware_list.insert(0, AutofixMiddleware())
    
    # 构建预配置的 React Agent
    agent_executor = create_agent(
        model=llm,
        tools=tools or [],
        system_prompt=system_prompt,
        middleware=middleware_list,
        checkpointer=checkpointer
    )
    
    return agent_executor
