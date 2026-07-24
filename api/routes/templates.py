"""
大屏模板导入端点
支持:
1. JSON 元数据直接导入
2. URL 导入 (存储 URL 供前端 iframe 渲染)
3. 批量导入 (JSON 数组)
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import sqlite3
import json
import uuid
import re
from infra.database import get_connection

router = APIRouter()

DB_PATH = "config.db"

def get_db():
    conn = sqlite3.connect("config.db", timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


class TemplateBase(BaseModel):
    template_id: str
    name: str
    category: str
    description: Optional[str] = ""
    style: Optional[str] = "科技蓝"
    scenario: Optional[str] = "通用"
    has_3d: Optional[int] = 0
    source: Optional[str] = ""
    preview_url: Optional[str] = ""
    layout_config: Optional[str] = "{}"
    is_enabled: Optional[int] = 1

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    style: Optional[str] = None
    scenario: Optional[str] = None
    has_3d: Optional[int] = None
    source: Optional[str] = None
    preview_url: Optional[str] = None
    layout_config: Optional[str] = None
    is_enabled: Optional[int] = None

class UrlImportRequest(BaseModel):
    url: str
    name: Optional[str] = None
    category: Optional[str] = "visualization"
    style: Optional[str] = "科技蓝"
    scenario: Optional[str] = "通用"
    description: Optional[str] = ""
    tags: Optional[List[str]] = []

class BatchImportRequest(BaseModel):
    templates: List[Dict[str, Any]]
    overwrite: Optional[bool] = False


@router.get("/")
def list_templates(
    style: Optional[str] = None,
    scenario: Optional[str] = None,
    category: Optional[str] = None,
    has_3d: Optional[int] = None,
    q: Optional[str] = None,
):
    with get_connection("config.db") as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM dashboard_templates WHERE 1=1"
        params = []

        if style:
            query += " AND style = ?"
            params.append(style)
        if scenario:
            query += " AND scenario = ?"
            params.append(scenario)
        if category:
            query += " AND category = ?"
            params.append(category)
        if has_3d is not None:
            query += " AND has_3d = ?"
            params.append(has_3d)
        if q:
            query += " AND (name LIKE ? OR description LIKE ? OR scenario LIKE ?)"
            like = f"%{q}%"
            params.extend([like, like, like])

        query += " ORDER BY category, style, name"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


@router.get("/meta/stats")
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    """返回模板库统计摘要"""
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM dashboard_templates")
    total = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as cnt FROM dashboard_templates WHERE has_3d=1")
    total_3d = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) as cnt FROM dashboard_templates WHERE is_enabled=1")
    enabled = cursor.fetchone()["cnt"]

    cursor.execute("SELECT category, COUNT(*) as c FROM dashboard_templates GROUP BY category ORDER BY c DESC")
    by_category = {r["category"]: r["c"] for r in cursor.fetchall()}

    cursor.execute("SELECT style, COUNT(*) as c FROM dashboard_templates GROUP BY style ORDER BY c DESC")
    by_style = {r["style"]: r["c"] for r in cursor.fetchall()}

    cursor.execute("SELECT scenario, COUNT(*) as c FROM dashboard_templates GROUP BY scenario ORDER BY c DESC LIMIT 15")
    by_scenario = {r["scenario"]: r["c"] for r in cursor.fetchall()}

    return {
        "total": total,
        "total_3d": total_3d,
        "enabled": enabled,
        "by_category": by_category,
        "by_style": by_style,
        "by_scenario": by_scenario,
    }


@router.get("/{template_id}", response_model=TemplateBase)
def get_template(template_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM dashboard_templates WHERE template_id = ?", (template_id,))
    row = cursor.fetchone()
    if not row:
        # Fallback to default 3D smart factory template if template_id is missing or legacy
        cursor.execute("SELECT * FROM dashboard_templates WHERE template_id = 'tpl_digital_twin_smart_factory'")
        row = cursor.fetchone()
        if not row:
            cursor.execute("SELECT * FROM dashboard_templates LIMIT 1")
            row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return dict(row)


@router.post("/", response_model=TemplateBase)
def create_template(template: TemplateCreate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT template_id FROM dashboard_templates WHERE template_id = ?", (template.template_id,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Template ID already exists")
    _insert_template(cursor, template.model_dump())
    db.commit()
    return template


@router.put("/{template_id}", response_model=TemplateBase)
def update_template(template_id: str, template: TemplateUpdate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM dashboard_templates WHERE template_id = ?", (template_id,))
    existing = cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = {k: v for k, v in template.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        return dict(existing)

    set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
    values = list(update_data.values())
    values.append(template_id)

    cursor.execute(
        f"UPDATE dashboard_templates SET {set_clause}, updated_at = datetime('now','localtime') WHERE template_id = ?",
        values
    )
    db.commit()
    cursor.execute("SELECT * FROM dashboard_templates WHERE template_id = ?", (template_id,))
    return dict(cursor.fetchone())


@router.delete("/{template_id}")
def delete_template(template_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT template_id FROM dashboard_templates WHERE template_id = ?", (template_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Template not found")
    cursor.execute("DELETE FROM dashboard_templates WHERE template_id = ?", (template_id,))
    db.commit()
    return {"message": "Template deleted successfully"}


@router.post("/import/url")
def import_from_url(req: UrlImportRequest, db: sqlite3.Connection = Depends(get_db)):
    """
    通过 URL 导入模板 (存储 URL 供前端 iframe 渲染使用)
    """
    # 自动生成 template_id
    safe_name = re.sub(r'[^a-z0-9]', '_', (req.name or "imported").lower())[:30]
    template_id = f"import_{safe_name}_{uuid.uuid4().hex[:6]}"

    # 推断有无 3D（根据 URL 中的关键字）
    has_3d = 1 if any(k in req.url.lower() for k in ['3d', 'three', 'twin', 'digital']) else 0

    layout_config = json.dumps({
        "source_url": req.url,
        "render_mode": "iframe",
        "tags": req.tags or [],
        "subcategory": "imported",
        "complexity": "medium",
        "chart_types": []
    }, ensure_ascii=False)

    data = {
        "template_id": template_id,
        "name": req.name or f"导入模板-{uuid.uuid4().hex[:4]}",
        "category": req.category,
        "description": req.description or f"从 {req.url[:60]} 导入",
        "style": req.style,
        "scenario": req.scenario,
        "has_3d": has_3d,
        "source": "用户导入",
        "preview_url": req.url,
        "layout_config": layout_config,
        "is_enabled": 1,
    }

    cursor = db.cursor()
    _insert_template(cursor, data)
    db.commit()

    return {"status": "success", "template_id": template_id, "message": "模板已导入，可在模板管理中预览"}


@router.post("/import/batch")
def batch_import(req: BatchImportRequest, db: sqlite3.Connection = Depends(get_db)):
    """
    批量导入模板元数据 (JSON 数组)
    """
    cursor = db.cursor()
    inserted = 0
    skipped = 0
    errors = []

    for tpl in req.templates:
        try:
            if not tpl.get("template_id"):
                tpl["template_id"] = f"batch_{uuid.uuid4().hex[:8]}"
            if not tpl.get("name"):
                errors.append(f"Missing name for {tpl.get('template_id')}")
                continue
            if not tpl.get("category"):
                tpl["category"] = "visualization"

            # Check existing
            cursor.execute("SELECT template_id FROM dashboard_templates WHERE template_id = ?", (tpl["template_id"],))
            exists = cursor.fetchone()

            if exists and not req.overwrite:
                skipped += 1
                continue

            if exists and req.overwrite:
                cursor.execute("DELETE FROM dashboard_templates WHERE template_id = ?", (tpl["template_id"],))

            # Defaults
            tpl.setdefault("style", "科技蓝")
            tpl.setdefault("scenario", "通用")
            tpl.setdefault("has_3d", 0)
            tpl.setdefault("source", "批量导入")
            tpl.setdefault("preview_url", "")
            tpl.setdefault("description", "")
            tpl.setdefault("is_enabled", 1)
            if "layout_config" in tpl and isinstance(tpl["layout_config"], dict):
                tpl["layout_config"] = json.dumps(tpl["layout_config"], ensure_ascii=False)
            else:
                tpl.setdefault("layout_config", "{}")

            _insert_template(cursor, tpl)
            inserted += 1
        except Exception as e:
            errors.append(f"{tpl.get('template_id', '?')}: {str(e)}")

    db.commit()
    return {
        "status": "success",
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors,
    }


@router.post("/import/file")
async def import_from_file(file: UploadFile = File(...), db: sqlite3.Connection = Depends(get_db)):
    """
    通过上传 JSON 文件批量导入模板
    """
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")

    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")

    # Support both single template and array
    if isinstance(data, dict):
        templates = [data]
    elif isinstance(data, list):
        templates = data
    else:
        raise HTTPException(status_code=400, detail="JSON must be an object or array of template objects")

    req = BatchImportRequest(templates=templates, overwrite=False)
    return batch_import(req, db)


def _insert_template(cursor: sqlite3.Cursor, data: dict):
    """Helper to insert a template row."""
    cursor.execute("""
        INSERT INTO dashboard_templates
            (template_id, name, category, description, style, scenario, has_3d,
             source, preview_url, layout_config, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("template_id"),
        data.get("name"),
        data.get("category", "visualization"),
        data.get("description", ""),
        data.get("style", "科技蓝"),
        data.get("scenario", "通用"),
        int(data.get("has_3d", 0)),
        data.get("source", ""),
        data.get("preview_url", ""),
        data.get("layout_config", "{}"),
        int(data.get("is_enabled", 1)),
    ))
