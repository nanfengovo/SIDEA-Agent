from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from infra.config_store import get_llm_model_config


def create_llm(model_name: str) -> BaseChatModel:
    llm_model_config = get_llm_model_config(model_name)
    if llm_model_config is None:
        raise ValueError(f"未在数据库中找到模型配置: {model_name}")
    provider = llm_model_config["provider"]
    base_url = llm_model_config["base_url"]
    match provider:
        case "openai":
            return ChatOpenAI(
                model=model_name,
                base_url=base_url,
                api_key=llm_model_config["api_key"],
            )
        case "ollama":
            return ChatOllama(
                model=model_name,
                base_url=base_url,
            )
        case _:
            raise ValueError(f"不支持的模型提供商: {provider}")

if __name__ == "__main__":
    import os

    os.environ["NO_PROXY"] = "localhost,127.0.0.1"
    os.environ["no_proxy"] = "localhost,127.0.0.1"
    model = create_llm("gemma4:e2b-it-qat")
    model = create_llm("got")
    print(model)
    print(type(model))
    print(model.invoke("你好"))
