import os
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage
from langchain.agents import create_agent
from langchain.agents.middleware import ContextEditingMiddleware, ClearToolUsesEdit
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3

from infra.config_store import ConfigStore
from infra.logging.structured_logger import get_structured_logger
from skills.registry import SkillRegistry

logger = get_structured_logger("agent.graph")

def _get_llm(config_store: ConfigStore):
    model_name = config_store.get("LLM_MODEL_NAME", "gemma4:e2b-it-qat")
    temperature = config_store.get_float("LLM_TEMPERATURE", 0.1)
    base_url = config_store.get("OLLAMA_BASE_URL", "http://localhost:11434")
    
    # 强制设置空代理，避免本地调用 ollama 时遭遇 httpx proxy 错误
    os.environ["HTTP_PROXY"] = ""
    os.environ["HTTPS_PROXY"] = ""
    
    return ChatOllama(
        model=model_name,
        temperature=temperature,
        base_url=base_url
    )

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite

async def create_agent_for_skill(skill_id: str, db_path: str = "config.db", checkpointer=None):
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
    
    llm = _get_llm(config_store)
    tools = skill_data["tools"]
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
    
    # 构建预配置的 React Agent
    agent_executor = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        middleware=[
            ContextEditingMiddleware(
                edits=[
                    ClearToolUsesEdit(
                        trigger=50,
                        keep=0,
                    ),
                ],
            ),
        ],
        checkpointer=checkpointer
    )
    
    return agent_executor
