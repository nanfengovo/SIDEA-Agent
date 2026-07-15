from langgraph.prebuilt import create_react_agent

from core.llm_factory import create_llm
from skills.registry import get_role_info, get_tool_for_role


def build_agent(role_name:str,override_model_name:str=None):
    """
    用提示词，模型和工具组装Agent
    :param role_name: 角色名称，不同的角色对应不同的提示词
    :param override_model_name: 模型名称
    :return:
    """
    # 获取特定角色的提示词
    role_info = get_role_info(role_name)
    if not role_info:
        raise ValueError(f"无法组装 Agent，找不到角色: {role_name}")

    system_prompt = role_info["system_prompt"]

    # 模型判定 优先级前端选择>角色默认>兜底模型
    if override_model_name:
        final_model_name = override_model_name
    elif role_info["default_model_id"]:
        final_model_name = role_info["default_model_id"]
    else:
        final_model_name = "ollama_gemma"

    llm = create_llm(final_model_name)

    tools = get_tool_for_role(role_name)

    agent = create_react_agent(
        model = llm,
        tools = tools,
        prompt=system_prompt
    )

    return agent


if __name__ == "__main__":
    import os

    os.environ["NO_PROXY"] = "localhost,127.0.0.1"
    os.environ["no_proxy"] = "localhost,127.0.0.1"
    # 1. 模拟前端点选了“PLC 故障诊断专家”
    my_agent = build_agent("PLC 故障诊断专家")
    print("✅ Agent 组装成功！")

    # 2. 模拟用户发消息：由于我们写了日志查询工具，我们故意问一个需要查工具的问题
    user_message = "今天PLC设备出啥事了？"
    print(f"👨‍💻 用户: {user_message}")

    # 3. 让 Agent 开始工作，并打印出它的思维链
    # LangGraph 需要的输入格式是一个包含 messages 的字典
    inputs = {"messages": [("user", user_message)]}

    # stream 模式可以看到它是一步步思考还是调用工具
    for chunk in my_agent.stream(inputs, stream_mode="values"):
        last_message = chunk["messages"][-1]

        # 看看是人在说话，还是 AI 在思考，还是工具在返回结果
        print(f"\n[{last_message.type.upper()}] 正在输出...")

        # 如果大模型决定调用工具，打印出它想用啥工具、传了啥参数
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            print("🛠️ 准备调用工具:", last_message.tool_calls)
        else:
            print(last_message.content)