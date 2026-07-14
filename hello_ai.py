from langchain_ollama import OllamaLLM


def hello_ollama():
    # ⚠️ 请务必确保这里的模型名称，在你终端运行 ollama list 时能看到！
    # 如果你本地装的是 qwen2.5，就改成 qwen2.5:7b
    model_name = "gemma4:e2b-it-qat"

    print(f"正在连接本地模型 {model_name}...")

    # 使用最新版的类 OllamaLLM
    llm = OllamaLLM(model=model_name)

    # 向模型提问
    prompt = "你是一个工控专家。请用一句话解释什么是 PLC？"
    print(f"提问: {prompt}")

    try:
        # 获取回答
        response = llm.invoke(prompt)
        print(f"回答: {response}")
    except Exception as e:
        print(f"调用模型失败，请检查 Ollama 是否启动，或者模型名称是否正确。错误信息: {e}")


if __name__ == "__main__":
    hello_ollama()