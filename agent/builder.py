"""
agent/builder.py
用于在 PyCharm 中直接调试 Agent 工具调用行为的入口脚本。
使用同步 .stream() 接口，可以在终端实时看到思维链。
"""
import os
os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

from pathlib import Path
import sqlite3
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite import SqliteSaver

from core.llm_factory import create_llm
from skills.registry import SkillRegistry

# ── 检查点 ──────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent.parent / "checkpoints.sqlite"
sqlite_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
checkpointer = SqliteSaver(sqlite_conn)
checkpointer.setup()

def build_agent(skill_id: str = "plc_diagnostics"):
    """
    用 SkillRegistry 加载技能配置，构建 LangGraph React Agent。
    :param skill_id: 技能 ID，对应数据库 skills 表
    :return: LangGraph CompiledStateGraph
    """
    registry = SkillRegistry()
    skill_data = registry.load_skill(skill_id)

    llm = create_llm()  # 从 ConfigStore 读当前配置
    tools = skill_data["tools"]
    system_prompt = skill_data["system_prompt"]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
        checkpointer=checkpointer,
    )
    return agent


if __name__ == "__main__":
    skill = "plc_diagnostics"
    my_agent = build_agent(skill)
    print(f"✅ Agent [{skill}] 组装成功，挂载工具: {[t.name for t in SkillRegistry().load_skill(skill)['tools']]}")

    user_message = "今天PLC设备出啥事了？"
    print(f"\n👨‍💻 用户: {user_message}\n")
    print("=" * 60)

    config = {"configurable": {"thread_id": "debug_session_002"}}
    inputs = {"messages": [("user", user_message)]}

    for chunk in my_agent.stream(inputs, config=config, stream_mode="values"):
        last_message = chunk["messages"][-1]
        msg_type = last_message.__class__.__name__

        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            print(f"\n🛠️  [AI] 准备调用工具:")
            for tc in last_message.tool_calls:
                print(f"    ▶ {tc['name']}({tc['args']})")
        elif msg_type == "ToolMessage":
            print(f"\n📦 [TOOL:{last_message.name}] 返回结果:\n{last_message.content[:500]}")
        elif msg_type == "AIMessage" and last_message.content:
            print(f"\n🤖 [AI] 最终回复:\n{last_message.content}")