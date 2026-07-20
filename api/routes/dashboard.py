"""大屏模板管理 API — 多风格模板目录 / 预览 / 渲染"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from dashboard.template_manager import (
    get_scenes,
    get_styles,
    get_template,
    get_template_stats,
    list_sources,
    list_templates,
    recommend_templates,
    sync_catalog_to_db,
)
from dashboard.template_renderer import OUTPUT_ROOT, render_dashboard

router = APIRouter(prefix="/dashboard", tags=["大屏模板管理"])


class RenderRequest(BaseModel):
    template_id: str = Field(description="模板 ID")
    data: Optional[dict[str, Any]] = Field(default=None, description="注入模板槽位的数据")
    save: bool = Field(default=True, description="是否保存渲染结果到本地")


@router.get("/stats")
async def dashboard_stats():
    """模板库统计 — 总数/风格/场景/3D数量"""
    return {"status": "success", "data": get_template_stats()}


@router.get("/sources")
async def dashboard_sources():
    """模板来源列表 — BigDataView/GoView/OneTwin 等"""
    return {"status": "success", "data": list_sources()}


@router.get("/styles")
async def dashboard_styles():
    return {"status": "success", "data": get_styles()}


@router.get("/scenes")
async def dashboard_scenes():
    return {"status": "success", "data": get_scenes()}


@router.get("/templates")
async def dashboard_templates(
    style: Optional[str] = Query(None, description="风格: tech-blue/cyberpunk/dark-gold/industrial/holographic 等"),
    scene: Optional[str] = Query(None, description="场景: rcs/warehouse/factory/logistics/cockpit 等"),
    source_id: Optional[str] = Query(None),
    has_3d: Optional[bool] = Query(None, description="是否含3D/数字孪生"),
    template_type: Optional[str] = Query(None, description="类型: jinja2_native/html_static/digital_twin_3d 等"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """分页查询大屏模板 — 支持多维度筛选"""
    result = list_templates(
        style=style,
        scene=scene,
        source_id=source_id,
        has_3d=has_3d,
        template_type=template_type,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return {"status": "success", **result}


@router.get("/templates/{template_id}")
async def dashboard_template_detail(template_id: str):
    tpl = get_template(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    return {"status": "success", "data": tpl}


@router.post("/templates/recommend")
async def dashboard_recommend(
    purpose: str = Query(..., description="用途描述，如：RCS自动化率驾驶舱、Erack数字孪生"),
    prefer_3d: bool = Query(False),
    limit: int = Query(5, ge=1, le=20),
):
    """根据自然语言用途推荐模板 — Agent 核心能力"""
    items = recommend_templates(purpose, prefer_3d=prefer_3d, limit=limit)
    return {"status": "success", "purpose": purpose, "items": items}


@router.post("/templates/sync")
async def dashboard_sync_catalog():
    """从 catalog 同步全网模板到数据库"""
    count = sync_catalog_to_db()
    stats = get_template_stats()
    return {"status": "success", "synced": count, "stats": stats}


@router.post("/render")
async def dashboard_render(request: RenderRequest):
    """将数据注入模板槽位并渲染大屏"""
    try:
        result = render_dashboard(
            request.template_id,
            request.data,
            save=request.save,
        )
        return {"status": "success", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/preview/{template_id}")
async def dashboard_preview(template_id: str):
    """预览原生模板（演示数据）"""
    try:
        result = render_dashboard(template_id, save=False)
        if result.get("render_type") == "native_html":
            # 重新渲染获取 HTML
            result2 = render_dashboard(template_id, save=True)
            fname = Path(result2["output_path"]).name
            return FileResponse(
                OUTPUT_ROOT / fname,
                media_type="text/html",
            )
        tpl = get_template(template_id)
        if tpl and tpl.get("preview_url", "").startswith("http"):
            return {
                "status": "redirect",
                "preview_url": tpl["preview_url"],
                "message": "外部模板请访问 preview_url 在线预览",
            }
        raise HTTPException(status_code=404, detail="无法预览")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/output/{filename}")
async def dashboard_output_file(filename: str):
    """访问已渲染的大屏 HTML 文件"""
    path = OUTPUT_ROOT / filename
    if not path.exists() or ".." in filename:
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path, media_type="text/html")
