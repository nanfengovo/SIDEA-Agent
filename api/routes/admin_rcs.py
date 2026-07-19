"""Admin API：RCS 连接器 Profile / Binding CRUD、探测、导入导出。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from integrations.rcs import (
    activate_profile,
    capability_catalog,
    create_profile,
    delete_profile,
    export_profile_pack,
    get_active_profile,
    get_profile,
    import_profile_pack,
    invoke_capability,
    list_bindings,
    list_profiles,
    nxp_default_bindings,
    replace_bindings,
    seed_nxp_erack_profile,
    update_profile,
    upsert_binding,
    AdapterError,
)

router = APIRouter()


class ProfileCreate(BaseModel):
    profile_id: Optional[str] = None
    name: str
    base_url: str
    auth_type: str = "bearer"
    auth_config: Dict[str, Any] = Field(default_factory=dict)
    timeout_ms: int = 15000
    is_simulation: bool = True
    is_active: bool = False
    extra_headers: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_config: Optional[Dict[str, Any]] = None
    timeout_ms: Optional[int] = None
    is_simulation: Optional[bool] = None
    extra_headers: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class BindingUpsert(BaseModel):
    capability_id: str
    method: str = "GET"
    path: str
    query: Dict[str, Any] = Field(default_factory=dict)
    body: Optional[Any] = None
    headers: Dict[str, Any] = Field(default_factory=dict)
    input_map: Dict[str, Any] = Field(default_factory=dict)
    response_map: Dict[str, Any] = Field(default_factory=dict)
    success_when: Dict[str, Any] = Field(default_factory=lambda: {"http_status": [200]})
    enabled: bool = True
    confirm_required: bool = False
    risk_level_override: Optional[str] = None


class BindingsReplace(BaseModel):
    bindings: List[BindingUpsert]


class ImportPack(BaseModel):
    pack: Dict[str, Any]
    activate: bool = False


class TestRequest(BaseModel):
    capability_id: str = "plc.read"
    params: Dict[str, Any] = Field(default_factory=dict)


@router.get("/admin/rcs/capabilities")
def api_capabilities():
    return capability_catalog()


@router.get("/admin/rcs/profiles")
def api_list_profiles():
    return list_profiles()


@router.get("/admin/rcs/profiles/active")
def api_active_profile():
    p = get_active_profile()
    if not p:
        return {"profile": None}
    return {"profile": p}


@router.post("/admin/rcs/profiles")
def api_create_profile(body: ProfileCreate):
    return create_profile(body.model_dump())


@router.put("/admin/rcs/profiles/{profile_id}")
def api_update_profile(profile_id: str, body: ProfileUpdate):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    p = update_profile(profile_id, data)
    if not p:
        raise HTTPException(404, "Profile not found")
    return p


@router.delete("/admin/rcs/profiles/{profile_id}")
def api_delete_profile(profile_id: str):
    if not delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return {"ok": True}


@router.post("/admin/rcs/profiles/{profile_id}/activate")
def api_activate(profile_id: str):
    p = activate_profile(profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    return p


@router.get("/admin/rcs/profiles/{profile_id}/bindings")
def api_list_bindings(profile_id: str):
    if not get_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return list_bindings(profile_id)


@router.put("/admin/rcs/profiles/{profile_id}/bindings")
def api_replace_bindings(profile_id: str, body: BindingsReplace):
    if not get_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return replace_bindings(profile_id, [b.model_dump() for b in body.bindings])


@router.post("/admin/rcs/profiles/{profile_id}/bindings")
def api_upsert_binding(profile_id: str, body: BindingUpsert):
    if not get_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return upsert_binding(profile_id, body.model_dump())


@router.get("/admin/rcs/profiles/{profile_id}/export")
def api_export(profile_id: str):
    pack = export_profile_pack(profile_id)
    if not pack:
        raise HTTPException(404, "Profile not found")
    return pack


@router.post("/admin/rcs/import")
def api_import(body: ImportPack):
    return import_profile_pack(body.pack, activate=body.activate)


@router.post("/admin/rcs/seed/nxp")
def api_seed_nxp():
    """强制确保 NXP 种子存在；若已有 profiles 则只返回状态。"""
    result = seed_nxp_erack_profile()
    return result


@router.get("/admin/rcs/seed/nxp-bindings")
def api_nxp_binding_template():
    return nxp_default_bindings()


@router.post("/admin/rcs/profiles/{profile_id}/test")
async def api_test(profile_id: str, body: TestRequest):
    if not get_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    # 临时激活语义：直接指定 profile_id 调用
    try:
        # 需要让 invoke 使用指定 profile —— 已支持 profile_id 参数
        result = await invoke_capability(
            body.capability_id, body.params or {}, profile_id=profile_id
        )
        return result
    except AdapterError as e:
        return e.as_dict()
