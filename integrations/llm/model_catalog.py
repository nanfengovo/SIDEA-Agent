"""按 Provider 拉取可用模型列表（Gemini / Ollama / OpenAI 兼容）。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx

from integrations.llm.profile_store import get_profile


def _gemini_category(model_id: str, display: str = "") -> str:
    """把 Google models.list 的 ID 归到控制台风格分类。"""
    text = f"{model_id} {display}".lower()
    if any(k in text for k in ("embedding",)):
        return "Other models"
    if any(k in text for k in ("imagen", "veo", "lyria", "image", "tts", "audio", "banana", "omni")):
        return "Multi-modal generative models"
    if any(k in text for k in ("live", "dialog", "translate")):
        return "Live API"
    if any(k in text for k in ("robotics", "computer-use", "gemma")):
        return "Other models"
    if any(k in text for k in ("deep-research", "antigravity")):
        return "Agents"
    if any(k in text for k in ("flash", "pro", "gemini")):
        return "Text-out models"
    return "Other models"


def _supports_generate_content(methods: List[str]) -> bool:
    return any("generateContent" in m or "generatecontent" in m.lower() for m in methods)


async def list_gemini_models(api_key: str) -> Dict[str, Any]:
    if not api_key or "••••" in api_key:
        return {"ok": False, "error": "需要有效的 Google API Key", "models": [], "groups": []}

    url = "https://generativelanguage.googleapis.com/v1beta/models"
    models: List[Dict[str, Any]] = []
    page_token: Optional[str] = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params: Dict[str, Any] = {"key": api_key, "pageSize": 100}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(url, params=params)
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "error": f"Gemini models.list 失败: HTTP {resp.status_code} {resp.text[:300]}",
                    "models": [],
                    "groups": [],
                }
            data = resp.json()
            for m in data.get("models") or []:
                name = str(m.get("name") or "")
                model_id = name.split("/")[-1] if name else ""
                if not model_id:
                    continue
                methods = list(m.get("supportedGenerationMethods") or [])
                # Agent 主链路需要 generateContent；仍列出全部，但优先可聊天的
                display = m.get("displayName") or model_id
                cat = _gemini_category(model_id, display)
                models.append(
                    {
                        "id": model_id,
                        "name": display,
                        "category": cat,
                        "description": m.get("description") or "",
                        "supports_chat": _supports_generate_content(methods),
                        "methods": methods,
                    }
                )
            page_token = data.get("nextPageToken")
            if not page_token:
                break

    # 可聊天优先，再按分类 / 名称
    models.sort(key=lambda x: (not x["supports_chat"], x["category"], x["id"]))
    groups = _group_models(models)
    return {"ok": True, "provider": "gemini_native", "models": models, "groups": groups}


async def list_ollama_models(base_url: str) -> Dict[str, Any]:
    base = (base_url or "http://localhost:11434").rstrip("/")
    url = f"{base}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "error": f"Ollama /api/tags 失败: HTTP {resp.status_code}",
                    "models": [],
                    "groups": [],
                }
            data = resp.json()
    except Exception as e:
        return {"ok": False, "error": f"无法连接 Ollama: {e}", "models": [], "groups": []}

    models = []
    for m in data.get("models") or []:
        mid = m.get("name") or m.get("model") or ""
        if not mid:
            continue
        models.append(
            {
                "id": mid,
                "name": mid,
                "category": "Local Ollama",
                "description": m.get("details", {}).get("family") or "",
                "supports_chat": True,
                "methods": [],
            }
        )
    models.sort(key=lambda x: x["id"])
    return {"ok": True, "provider": "ollama", "models": models, "groups": _group_models(models)}


async def list_openai_compatible_models(base_url: str, api_key: str) -> Dict[str, Any]:
    if not api_key or "••••" in api_key:
        return {"ok": False, "error": "需要有效的 API Key", "models": [], "groups": []}
    base = (base_url or "https://api.openai.com/v1").rstrip("/")
    if not base.endswith("/v1") and "/v1/" not in base + "/":
        # 允许用户填到根；补 /v1
        url = urljoin(base + "/", "v1/models")
    else:
        url = base.rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "error": f"OpenAI models 失败: HTTP {resp.status_code} {resp.text[:300]}",
                    "models": [],
                    "groups": [],
                }
            data = resp.json()
    except Exception as e:
        return {"ok": False, "error": f"无法连接: {e}", "models": [], "groups": []}

    models = []
    for m in data.get("data") or []:
        mid = m.get("id") or ""
        if not mid:
            continue
        owned = m.get("owned_by") or "openai"
        models.append(
            {
                "id": mid,
                "name": mid,
                "category": str(owned),
                "description": "",
                "supports_chat": True,
                "methods": [],
            }
        )
    models.sort(key=lambda x: (x["category"], x["id"]))
    return {
        "ok": True,
        "provider": "openai_compatible",
        "models": models,
        "groups": _group_models(models),
    }


def _group_models(models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    order: List[str] = []
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for m in models:
        cat = m.get("category") or "Other"
        if cat not in buckets:
            buckets[cat] = []
            order.append(cat)
        buckets[cat].append(m)
    return [{"category": c, "models": buckets[c]} for c in order]


async def list_models_for_profile(profile_id: str, api_key_override: Optional[str] = None) -> Dict[str, Any]:
    p = get_profile(profile_id, mask_key=False)
    if not p:
        return {"ok": False, "error": "Profile not found", "models": [], "groups": []}

    provider = p.get("provider") or "ollama"
    api_key = api_key_override if api_key_override and "••••" not in api_key_override else (p.get("api_key") or "")
    base_url = p.get("base_url") or ""

    if provider == "gemini_native":
        return await list_gemini_models(api_key)
    if provider == "ollama":
        return await list_ollama_models(base_url)
    if provider in ("openai", "openai_compatible"):
        return await list_openai_compatible_models(base_url, api_key)
    return {"ok": False, "error": f"不支持拉取模型的 provider: {provider}", "models": [], "groups": []}


async def list_models_ad_hoc(
    provider: str,
    *,
    api_key: str = "",
    base_url: str = "",
) -> Dict[str, Any]:
    """新建 Profile 尚未保存时，按表单字段临时拉取。"""
    if provider == "gemini_native":
        return await list_gemini_models(api_key)
    if provider == "ollama":
        return await list_ollama_models(base_url or "http://localhost:11434")
    if provider in ("openai", "openai_compatible"):
        return await list_openai_compatible_models(
            base_url or "https://api.openai.com/v1",
            api_key,
        )
    return {"ok": False, "error": f"不支持: {provider}", "models": [], "groups": []}
