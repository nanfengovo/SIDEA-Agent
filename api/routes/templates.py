"""大屏看板模板公开 API — 供前端 DashboardPanel 加载"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from dashboard.store import get_template, list_templates, resolve_template_id

router = APIRouter(tags=["大屏看板模板"])


@router.get("/templates")
async def list_public_templates(
    category_id: Optional[str] = Query(None),
    style: Optional[str] = Query(None),
    scene: Optional[str] = Query(None),
    has_3d: Optional[bool] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    result = list_templates(
        category_id=category_id,
        style=style,
        scene=scene,
        has_3d=has_3d,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return result


@router.get("/templates/{template_id:path}")
async def get_public_template(template_id: str):
    """
    获取模板完整定义（含 dashboard_json）。
    支持 slug、别名（如 amr command center）、中文名。
    """
    resolved = resolve_template_id(template_id)
    if not resolved:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    tpl = get_template(resolved)
    if not tpl:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    if not tpl.get("is_enabled", True):
        raise HTTPException(status_code=404, detail=f"模板已禁用: {template_id}")

    payload = tpl.get("dashboard_json")
    if payload:
        # 前端 DashboardPanel 期望直接拿到 dashboard JSON
        if isinstance(payload, dict):
            return payload
        return {"type": "dashboard", "raw": payload}

    # 外链/HTML 模板 — 返回元数据 + 预览链接
    return {
        "type": "external",
        "template_id": tpl["template_id"],
        "name": tpl["name"],
        "preview_url": tpl.get("preview_url"),
        "template_type": tpl.get("template_type"),
        "has_3d": tpl.get("has_3d"),
        "message": "此外链模板无内置 JSON，请访问 preview_url 或克隆源码",
    }
