from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
# 新增：导入 SystemMessage (系统指令) 和 HumanMessage (用户消息)
from langchain_core.messages import SystemMessage, HumanMessage
import os

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

# ==========================================
# 1. 定义工具 (Tools) —— Agent 的“手和脚”
# ==========================================
@tool
def read_plc_logs(time_range: str) -> str:
    """
    当用户询问 PLC 报错、停机原因、运行状态时，必须调用此工具获取 PLC 日志数据。
    参数 time_range: 时间范围描述，例如 "今天上午", "最近一小时"
    """
    print(f"\n[🔧 工具执行中...] 正在读取本地 PLC 日志，时间范围：{time_range}")
    mock_log_data = """
    时间: 2023-10-27 10:15:00 | 级别: ERROR | 设备: PLC_A1 | 信息: 传送带电机过载停机，错误码 E-102
    时间: 2023-10-27 10:18:00 | 级别: WARNING | 设备: PLC_A1 | 信息: 尝试重启失败，温度异常
    """
    return mock_log_data

# ==========================================
# 2. 定义 Skill (技能/提示词模板：负责定规矩和思维模型)
# ==========================================
plc_diagnostic_skill_prompt = """
你现在是 SIDEA 工控智能诊断专家。
当用户询问故障时，你必须调用工具获取日志，并【严格】按照以下 Markdown 格式输出诊断报告：

🚨 【故障设备】: (提取设备名)
⚠️ 【错误代码】: (提取错误码)
🔍 【原因分析】: (用你的工控知识，一句话解释这个错误码可能导致的物理后果)
🛠️ 【排查建议】: (给出2步具体排查动作，比如检查接线、检查传感器等)

注意：态度要专业、严谨，不要说任何多余的废话。
"""

# ==========================================
# 3. 初始化大模型与 Agent
# ==========================================
llm = ChatOllama(
    model="gemma4:e2b-it-qat",
    temperature=0.1,
    base_url="http://localhost:11434"
)

tools = [read_plc_logs]

# 恢复最纯净的 Agent 创建方式（不依赖版本特定的 kwargs）
agent_executor = create_react_agent(llm, tools)

if __name__ == "__main__":
    print("🤖 SIDEA 智能诊断助手已启动！(按 Ctrl+C 退出)")
    print("-" * 50)

    user_query = "今天上午 PLC 为啥停机了？"
    print(f"👤 用户提问: {user_query}")
    print("-" * 50)

    # ==========================================
    # 🌟 核心魔法：在这里注入 Skill！
    # ==========================================
    # 将 Skill 作为最高优先级的“系统消息”传入，让 AI 带着“专家身份”去回答
    inputs = {
        "messages": [
            SystemMessage(content=plc_diagnostic_skill_prompt), # <--- 注入 Skill
            HumanMessage(content=user_query)                    # <--- 用户提问
        ]
    }

    # 运行 Agent 流程
    for event in agent_executor.stream(inputs, stream_mode="values"):
        last_message = event["messages"][-1]

        # 捕获 AI 最终回复
        if last_message.type == "ai" and not last_message.tool_calls:
            print("\n🤖 AI 最终诊断结果:")
            print(last_message.content)