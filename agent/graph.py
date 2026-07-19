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
    from langchain_core.messages import HumanMessage
    
    class CompressionNotificationMiddleware(AgentMiddleware):
        def __init__(self, sse_queue):
            self.sse_queue = sse_queue
            
        async def awrap_model_call(self, request, handler):
            if len(request.messages) > 15 and self.sse_queue:
                import uuid
                await self.sse_queue.put({
                    "id": uuid.uuid4().hex,
                    "type": "tool_start",
                    "data": {
                        "name": "ContextCompressor",
                        "input": f"检测到历史消息已达 {len(request.messages)} 条",
                        "message": "⚠️ 历史记忆过长，正在触发智能压缩与提纯算法..."
                    }
                })
                
                response = await handler(request)
                
                await self.sse_queue.put({
                    "id": uuid.uuid4().hex,
                    "type": "tool_end",
                    "data": {
                        "name": "ContextCompressor",
                        "output": "压缩完成",
                        "message": "记忆提纯完成，已成功释放上下文空间！"
                    }
                })
                return response
            return await handler(request)

    # 原始的中间件配置
    middleware_list = [
        CompressionNotificationMiddleware(sse_queue),
        SummarizationMiddleware(
            model=llm,
            trigger=[
                ("messages", 15), # 当历史消息超过 15 条时触发摘要
            ],
            keep=("messages", 3), # 强制保留最近的 3 条消息原文，其余的老历史浓缩为一条摘要
            summary_prompt="请用精简的语言总结以下历史对话记录，保留核心意图和关键信息：\n{messages}"
        ),
        ContextEditingMiddleware(
            edits=[
                ClearToolUsesEdit(
                    trigger=64000,
                    keep=3,
                ),
            ],
        ),
    ]
    
    # 强制工具执行拦截 (Level 1 Defense - 中间件 Output Validator)
    if force_tool and tools:
        class AutofixMiddleware(AgentMiddleware):
            async def awrap_model_call(self, request, handler):
                is_autofix = False
                if request.messages:
                    last_msg = request.messages[-1]
                    if hasattr(last_msg, "content") and "[系统异常拦截]" in str(last_msg.content):
                        is_autofix = True
                        
                # 遇到假执行时最多重试 3 次
                for attempt in range(3):
                    response = await handler(request)
                    ai_msg = response.result[0] if (response and response.result) else None
                    
                    # 如果当前是自动修复环节，且模型仍然没有输出 tool_calls，则视为假执行幻觉
                    if is_autofix and ai_msg and not getattr(ai_msg, "tool_calls", None):
                        # 将失败的输出加入上下文，并追加强烈的系统警告，强制其重新生成
                        new_messages = list(request.messages)
                        new_messages.append(ai_msg)
                        new_messages.append(HumanMessage(content="[System] INVALID. You MUST output a tool call JSON. Do NOT output markdown or plain text."))
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
