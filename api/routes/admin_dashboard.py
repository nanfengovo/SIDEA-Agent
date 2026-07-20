"""大屏看板模板管理 API — 分类 / CRUD / 预览 / 同步"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from dashboard.seed import seed_all
from dashboard.store import (
    create_template,
    delete_template,
    get_stats,
    get_styles,
    get_template,
    list_categories,
    list_templates,
    update_template,
)
from dashboard.template_renderer import render_dashboard

router = APIRouter(prefix="/admin/dashboard", tags=["Admin 大屏看板"])


class TemplateCreate(BaseModel):
    template_id: str
    category_id: str = "general"
    name: str
    description: str = ""
    style: str = "tech-blue"
    scene: str = "general"
    template_type: str = "json_dashboard"
    has_3d: bool = False
    preview_url: Optional[str] = None
    local_path: Optional[str] = None
    dashboard_json: Optional[dict[str, Any]] = None
    source_id: str = "sidea"
    recommended_for: list[str] = Field(default_factory=list)
    data_slots: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    priority: int = 50
    is_enabled: bool = True


class TemplateUpdate(BaseModel):
    category_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    style: Optional[str] = None
    scene: Optional[str] = None
    template_type: Optional[str] = None
    has_3d: Optional[bool] = None
    preview_url: Optional[str] = None
    local_path: Optional[str] = None
    dashboard_json: Optional[dict[str, Any]] = None
    source_id: Optional[str] = None
    recommended_for: Optional[list[str]] = None
    data_slots: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    aliases: Optional[list[str]] = None
    priority: Optional[int] = None
    is_enabled: Optional[bool] = None


class CategoryCreate(BaseModel):
    category_id: str
    name: str
    description: str = ""
    icon: str = "layout"
    sort_order: int = 50


@router.get("/stats")
async def admin_stats():
    return get_stats()


@router.get("/categories")
async def admin_categories():
    return list_categories()


@router.post("/categories")
async def admin_create_category(body: CategoryCreate):
    from infra.database import get_connection
    from datetime import datetime

    with get_connection("config.db") as conn:
        conn.execute(
            """
            INSERT INTO dashboard_categories (category_id, name, description, icon, sort_order, created_at)
            VALUES (?,?,?,?,?,?)
            """,
            (body.category_id, body.name, body.description, body.icon, body.sort_order, datetime.now().isoformat()),
        )
        conn.commit()
    return {"status": "ok", "category_id": body.category_id}


@router.get("/templates")
async def admin_list_templates(
    category_id: Optional[str] = Query(None),
    style: Optional[str] = Query(None),
    scene: Optional[str] = Query(None),
    has_3d: Optional[bool] = Query(None),
    keyword: Optional[str] = Query(None),
    include_disabled: bool = Query(True),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return list_templates(
        category_id=category_id,
        style=style,
        scene=scene,
        has_3d=has_3d,
        keyword=keyword,
        include_disabled=include_disabled,
        limit=limit,
        offset=offset,
    )


@router.get("/templates/{template_id}")
async def admin_get_template(template_id: str):
    tpl = get_template(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    return tpl


@router.post("/templates")
async def admin_create_template(body: TemplateCreate):
    if get_template(body.template_id):
        raise HTTPException(status_code=409, detail="template_id 已存在")
    return create_template(body.model_dump())


@router.put("/templates/{template_id}")
async def admin_update_template(template_id: str, body: TemplateUpdate):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = update_template(template_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="模板不存在")
    return result


@router.delete("/templates/{template_id}")
async def admin_delete_template(template_id: str):
    if not delete_template(template_id):
        raise HTTPException(status_code=404, detail="模板不存在")
    return {"status": "deleted", "template_id": template_id}


@router.post("/templates/sync")
async def admin_sync_templates():
    result = seed_all()
    return {"status": "ok", **result, "stats": get_stats()}


@router.get("/styles")
async def admin_styles():
    return get_styles()


class RenderBody(BaseModel):
    data: Optional[dict[str, Any]] = None


@router.post("/templates/{template_id}/render")
async def admin_render_template(template_id: str, body: RenderBody = RenderBody()):
    try:
        return render_dashboard(template_id, body.data, save=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
