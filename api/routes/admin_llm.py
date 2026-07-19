"""Admin API：LLM Provider Profile CRUD / 激活 / 探测。"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from core.llm_factory import create_llm
from integrations.llm import (
    VALID_PROVIDERS,
    activate_profile,
    create_profile,
    delete_profile,
    get_active_profile,
    get_profile,
    list_models_ad_hoc,
    list_models_for_profile,
    list_profiles,
    seed_default_llm_profiles,
    update_profile,
)

router = APIRouter()


class ProfileCreate(BaseModel):
    profile_id: Optional[str] = None
    name: str
    provider: str = "ollama"
    base_url: str = ""
    api_key: str = ""
    model_name: str
    temperature: float = 0.1
    max_tokens: Optional[int] = None
    extra_config: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    is_active: bool = False
    notes: str = ""


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None
    notes: Optional[str] = None


class TestRequest(BaseModel):
    prompt: str = "Reply with exactly: OK"


class ListModelsRequest(BaseModel):
    """新建未保存 Profile 时临时拉取；已有 Profile 优先用 path 参数接口。"""
    provider: str
    api_key: str = ""
    base_url: str = ""
    chat_only: bool = True


class ProfileListModelsRequest(BaseModel):
    api_key: str = ""
    chat_only: bool = True


@router.get("/admin/llm/providers")
def api_providers():
    return {
        "providers": [
            {"id": "ollama", "label": "Ollama（本地）", "group": "Local"},
            {"id": "openai", "label": "OpenAI 官方", "group": "OpenAI"},
            {"id": "openai_compatible", "label": "OpenAI 兼容中转", "group": "OpenAI Compatible"},
            {"id": "gemini_native", "label": "Gemini 原生", "group": "Google Gemini"},
        ]
    }


@router.get("/admin/llm/profiles")
def api_list_profiles(
    enabled: Optional[int] = Query(None, description="1=仅已启用"),
    grouped: Optional[int] = Query(None, description="1=按 provider 分组返回"),
):
    items = list_profiles(enabled_only=bool(enabled), mask_key=True)
    if not grouped:
        return items
    label = {
        "ollama": "Ollama（本地）",
        "openai": "OpenAI 官方",
        "openai_compatible": "OpenAI 兼容中转",
        "gemini_native": "Google Gemini",
    }
    order = ["gemini_native", "openai", "openai_compatible", "ollama"]
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for p in items:
        prov = p.get("provider") or "other"
        buckets.setdefault(prov, []).append(p)
    groups = []
    for key in order:
        if key in buckets:
            groups.append({"provider": key, "label": label.get(key, key), "profiles": buckets.pop(key)})
    for key, plist in buckets.items():
        groups.append({"provider": key, "label": label.get(key, key), "profiles": plist})
    return {"groups": groups, "profiles": items}


@router.post("/admin/llm/models/list")
async def api_list_models_adhoc(body: ListModelsRequest):
    result = await list_models_ad_hoc(
        body.provider,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    if body.chat_only and result.get("ok"):
        models = [m for m in result.get("models") or [] if m.get("supports_chat")]
        from integrations.llm.model_catalog import _group_models

        result["models"] = models
        result["groups"] = _group_models(models)
    return result


@router.post("/admin/llm/profiles/{profile_id}/models")
async def api_list_models_for_profile(
    profile_id: str,
    body: ProfileListModelsRequest = ProfileListModelsRequest(),
):
    result = await list_models_for_profile(
        profile_id,
        api_key_override=body.api_key or None,
    )
    if body.chat_only and result.get("ok"):
        models = [m for m in result.get("models") or [] if m.get("supports_chat")]
        from integrations.llm.model_catalog import _group_models

        result["models"] = models
        result["groups"] = _group_models(models)
    return result


@router.get("/admin/llm/active")
def api_active():
    p = get_active_profile(mask_key=True)
    return {"profile": p}


@router.get("/admin/llm/profiles/{profile_id}")
def api_get_profile(profile_id: str):
    p = get_profile(profile_id, mask_key=True)
    if not p:
        raise HTTPException(404, "Profile not found")
    return p


@router.post("/admin/llm/profiles")
def api_create_profile(body: ProfileCreate):
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(400, f"invalid provider, expect one of {VALID_PROVIDERS}")
    try:
        created = create_profile(body.model_dump())
        return get_profile(created["profile_id"], mask_key=True)
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.put("/admin/llm/profiles/{profile_id}")
def api_update_profile(profile_id: str, body: ProfileUpdate):
    data = body.model_dump(exclude_unset=True)
    try:
        p = update_profile(profile_id, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not p:
        raise HTTPException(404, "Profile not found")
    return get_profile(profile_id, mask_key=True)


@router.delete("/admin/llm/profiles/{profile_id}")
def api_delete_profile(profile_id: str):
    active = get_active_profile(mask_key=True)
    if active and active.get("profile_id") == profile_id:
        raise HTTPException(400, "不能删除当前激活的 Profile，请先切换到其它 Profile")
    if not delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok"}


@router.post("/admin/llm/profiles/{profile_id}/activate")
def api_activate(profile_id: str):
    p = activate_profile(profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    return get_profile(profile_id, mask_key=True)


@router.post("/admin/llm/profiles/{profile_id}/test")
async def api_test(profile_id: str, body: TestRequest = TestRequest()):
    p = get_profile(profile_id, mask_key=False)
    if not p:
        raise HTTPException(404, "Profile not found")
    t0 = time.perf_counter()
    try:
        llm = create_llm(p)
        resp = await llm.ainvoke(body.prompt)
        text = getattr(resp, "content", None)
        if isinstance(text, list):
            text = "".join(
                (x.get("text") if isinstance(x, dict) else str(x)) for x in text
            )
        elif text is None:
            text = str(resp)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "latency_ms": latency_ms,
            "provider": p.get("provider"),
            "model_name": p.get("model_name"),
            "reply": str(text)[:500],
        }
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": False,
            "latency_ms": latency_ms,
            "provider": p.get("provider"),
            "model_name": p.get("model_name"),
            "error": str(e),
        }


@router.post("/admin/llm/seed")
def api_seed():
    return seed_default_llm_profiles()
