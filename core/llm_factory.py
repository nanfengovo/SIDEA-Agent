"""按 Active LLM Provider Profile 构建 ChatModel。"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional, Union
from urllib.parse import urlparse

from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama

from infra.config_store import ConfigStore
from integrations.llm.profile_store import get_active_profile, get_profile


def _is_local_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
        return host in ("localhost", "127.0.0.1", "::1") or not host
    except Exception:
        return False


def _prepare_proxy_env(provider: str, base_url: str) -> None:
    """仅本地 Ollama 时绕过代理；公网 Provider 不强制清空代理。"""
    if provider == "ollama" or _is_local_url(base_url):
        os.environ.setdefault("NO_PROXY", "localhost,127.0.0.1")
        os.environ.setdefault("no_proxy", "localhost,127.0.0.1")


def _resolve_profile(
    profile: Optional[Union[str, Dict[str, Any]]] = None,
    db_path: str = "config.db",
) -> Dict[str, Any]:
    if isinstance(profile, dict):
        return profile
    if isinstance(profile, str) and profile:
        p = get_profile(profile, db_path, mask_key=False)
        if p:
            return p
    active = get_active_profile(db_path, mask_key=False)
    if active:
        return active
    store = ConfigStore(db_path)
    return {
        "profile_id": "_fallback",
        "provider": "ollama",
        "base_url": store.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        "api_key": "",
        "model_name": store.get("LLM_MODEL_NAME", "gemma4:e2b-it-qat"),
        "temperature": float(store.get("LLM_TEMPERATURE", "0.1") or "0.1"),
        "max_tokens": None,
        "extra_config": {"num_ctx": 8192, "num_predict": 8192},
    }


def create_llm(
    profile: Optional[Union[str, Dict[str, Any]]] = None,
    *,
    db_path: str = "config.db",
    num_ctx: Optional[int] = None,
) -> BaseChatModel:
    """
    从 Active（或指定）Profile 构建 ChatModel。

    provider:
      - ollama
      - openai / openai_compatible → ChatOpenAI
      - gemini_native → ChatGoogleGenerativeAI
    """
    p = _resolve_profile(profile, db_path)
    provider = (p.get("provider") or "ollama").strip()
    model_name = p.get("model_name") or "gemma4:e2b-it-qat"
    base_url = str(p.get("base_url") or "").rstrip("/")
    api_key = p.get("api_key") or ""
    temperature = float(p.get("temperature") if p.get("temperature") is not None else 0.1)
    max_tokens = p.get("max_tokens")
    extra = p.get("extra_config") or {}
    if not isinstance(extra, dict):
        extra = {}

    _prepare_proxy_env(provider, base_url)

    if provider == "ollama":
        kwargs: Dict[str, Any] = {
            "model": model_name,
            "temperature": temperature,
            "base_url": base_url or "http://localhost:11434",
        }
        ctx = num_ctx if num_ctx is not None else extra.get("num_ctx")
        predict = extra.get("num_predict", 8192)
        if ctx is not None:
            kwargs["num_ctx"] = int(ctx)
        if predict is not None:
            kwargs["num_predict"] = int(predict)
        return ChatOllama(**kwargs)

    if provider in ("openai", "openai_compatible"):
        if not api_key:
            raise ValueError(f"Profile {p.get('profile_id')} 未配置 API Key（provider={provider}）")
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as e:
            raise ImportError(
                "缺少 langchain-openai，请执行: pip install langchain-openai"
            ) from e
        kwargs = {
            "model": model_name,
            "api_key": api_key,
            "temperature": temperature,
        }
        if base_url:
            kwargs["base_url"] = base_url
        if max_tokens:
            kwargs["max_tokens"] = int(max_tokens)
        return ChatOpenAI(**kwargs)

    if provider == "gemini_native":
        if not api_key:
            raise ValueError(f"Profile {p.get('profile_id')} 未配置 Google API Key（gemini_native）")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as e:
            raise ImportError(
                "缺少 langchain-google-genai，请执行: pip install langchain-google-genai"
            ) from e
        kwargs = {
            "model": model_name,
            "google_api_key": api_key,
            "temperature": temperature,
        }
        if max_tokens:
            kwargs["max_output_tokens"] = int(max_tokens)
        return ChatGoogleGenerativeAI(**kwargs)

    raise ValueError(f"不支持的 LLM provider: {provider}")


if __name__ == "__main__":
    model = create_llm()
    print(type(model), getattr(model, "model", None) or getattr(model, "model_name", None))
