from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
import os

from infra.config_store import ConfigStore


def create_llm(model_name: str = None) -> BaseChatModel:
    """从 ConfigStore 读取当前激活的 LLM 配置，构建并返回对应的 ChatModel"""
    os.environ.setdefault("NO_PROXY", "localhost,127.0.0.1")
    os.environ.setdefault("no_proxy", "localhost,127.0.0.1")
    
    store = ConfigStore()
    if model_name is None:
        model_name = store.get("LLM_MODEL_NAME", "gemma4:e2b-it-qat")
    
    base_url = store.get("OLLAMA_BASE_URL", "http://localhost:11434")
    temperature = float(store.get("LLM_TEMPERATURE", "0.1") or "0.1")
    
    # 简单规则: 如果 base_url 包含 openai 或模型名含 gpt/claude，使用 OpenAI 兼容
    if "openai" in base_url or model_name.startswith(("gpt-", "claude-")):
        api_key = store.get("API_ABP_TOKEN", "sk-placeholder")
        return ChatOpenAI(
            model=model_name,
            base_url=base_url,
            api_key=api_key,
            temperature=temperature,
        )
    else:
        return ChatOllama(
            model=model_name,
            base_url=base_url,
            temperature=temperature,
        )

if __name__ == "__main__":
    import os

    os.environ["NO_PROXY"] = "localhost,127.0.0.1"
    os.environ["no_proxy"] = "localhost,127.0.0.1"
    model = create_llm("gemma4:e2b-it-qat")
    model = create_llm("got")
    print(model)
    print(type(model))
    print(model.invoke("你好"))
