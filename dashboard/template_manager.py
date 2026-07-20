"""
大屏模板管理器 — 多风格模板目录的 CRUD / 筛选 / 推荐
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from infra.database import get_connection

CATALOG_DIR = Path(__file__).parent / "catalog"


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for key in ("tags", "recommended_for", "data_slots"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    if "has_3d" in d:
        d["has_3d"] = bool(d["has_3d"])
    return d


def list_sources() -> list[dict]:
    path = CATALOG_DIR / "sources.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def list_templates(
    *,
    style: str | None = None,
    scene: str | None = None,
    source_id: str | None = None,
    has_3d: bool | None = None,
    template_type: str | None = None,
    keyword: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """分页查询模板，支持多维度筛选"""
    conditions: list[str] = ["is_enabled = 1"]
    params: list[Any] = []

    if style:
        conditions.append("style = ?")
        params.append(style)
    if scene:
        conditions.append("scene = ?")
        params.append(scene)
    if source_id:
        conditions.append("source_id = ?")
        params.append(source_id)
    if has_3d is not None:
        conditions.append("has_3d = ?")
        params.append(1 if has_3d else 0)
    if template_type:
        conditions.append("template_type = ?")
        params.append(template_type)
    if keyword:
        conditions.append("(name LIKE ? OR template_id LIKE ? OR tags LIKE ?)")
        like = f"%{keyword}%"
        params.extend([like, like, like])

    where = " AND ".join(conditions)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM dashboard_templates WHERE {where}", params)
        total = cursor.fetchone()[0]
        cursor.execute(
            f"""
            SELECT * FROM dashboard_templates
            WHERE {where}
            ORDER BY priority DESC, name ASC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        items = [_row_to_dict(r) for r in cursor.fetchall()]
    return {"total": total, "items": items, "limit": limit, "offset": offset}


def get_template(template_id: str) -> dict | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM dashboard_templates WHERE template_id = ?",
            (template_id,),
        )
        return _row_to_dict(cursor.fetchone())


def get_styles() -> list[str]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT DISTINCT style FROM dashboard_templates WHERE is_enabled = 1 ORDER BY style"
        )
        return [r[0] for r in cursor.fetchall()]


def get_scenes() -> list[str]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT DISTINCT scene FROM dashboard_templates WHERE is_enabled = 1 ORDER BY scene"
        )
        return [r[0] for r in cursor.fetchall()]


def recommend_templates(
    purpose: str,
    *,
    prefer_3d: bool = False,
    limit: int = 5,
) -> list[dict]:
    """
    根据用途描述推荐模板 — Agent 调用
    简单关键词匹配 + 优先级排序；后续可接 embedding
    """
    purpose_lower = purpose.lower()
    scene_hints = {
        "rcs": ["rcs", "机器人", "自动化", "erack"],
        "warehouse": ["仓储", "立库", "仓库", "erack", "wms"],
        "factory": ["工厂", "产线", "mes", "生产"],
        "logistics": ["物流", "agv", "调度", "运输"],
        "cockpit": ["驾驶舱", "cxo", "管理", "汇报", "看板"],
        "energy": ["设备", "能耗", "环境", "监控"],
    }
    style_hints = {
        "cyberpunk": ["赛博", "酷炫", "炫酷"],
        "tech-blue": ["科技", "蓝色"],
        "dark-gold": ["暗金", "商务", "高端"],
        "holographic": ["全息", "孪生", "3d"],
        "red-alert": ["告警", "红色", "报警"],
        "industrial": ["工业"],
    }

    matched_scene = None
    for scene, kws in scene_hints.items():
        if any(k in purpose_lower for k in kws):
            matched_scene = scene
            break

    matched_style = None
    for style, kws in style_hints.items():
        if any(k in purpose_lower for k in kws):
            matched_style = style
            break

    want_3d = prefer_3d or any(
        k in purpose_lower for k in ["3d", "孪生", "三维", "数字孪生"]
    )

    result = list_templates(
        scene=matched_scene,
        style=matched_style,
        has_3d=True if want_3d else None,
        limit=limit * 3,
    )["items"]

    if not result and matched_scene:
        result = list_templates(scene=matched_scene, limit=limit)["items"]
    if not result:
        result = list_templates(scene="rcs", limit=limit)["items"]
    if not result:
        result = list_templates(limit=limit)["items"]

    # 用途关键词加分
    scored: list[tuple[int, dict]] = []
    for tpl in result:
        score = tpl.get("priority", 0)
        rec = tpl.get("recommended_for") or []
        tags = tpl.get("tags") or []
        blob = " ".join(rec + tags + [tpl.get("name", "")]).lower()
        for token in purpose_lower.replace("，", " ").split():
            if len(token) >= 2 and token in blob:
                score += 10
        if tpl.get("template_type") == "jinja2_native":
            score += 20  # 优先可本地渲染的原生模板
        scored.append((score, tpl))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in scored[:limit]]


def sync_catalog_to_db() -> int:
    """从 catalog/seed_templates.py 同步模板到 SQLite"""
    from dashboard.catalog.seed_templates import TEMPLATES

    now = datetime.now().isoformat()
    count = 0
    with get_connection() as conn:
        cursor = conn.cursor()
        for tpl in TEMPLATES:
            cursor.execute(
                """
                INSERT INTO dashboard_templates (
                    template_id, source_id, name, style, scene, template_type,
                    has_3d, preview_url, local_path, recommended_for, data_slots,
                    tags, priority, is_enabled, created_at, updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
                ON CONFLICT(template_id) DO UPDATE SET
                    source_id=excluded.source_id,
                    name=excluded.name,
                    style=excluded.style,
                    scene=excluded.scene,
                    template_type=excluded.template_type,
                    has_3d=excluded.has_3d,
                    preview_url=excluded.preview_url,
                    local_path=excluded.local_path,
                    recommended_for=excluded.recommended_for,
                    data_slots=excluded.data_slots,
                    tags=excluded.tags,
                    priority=excluded.priority,
                    updated_at=excluded.updated_at
                """,
                (
                    tpl["template_id"],
                    tpl["source_id"],
                    tpl["name"],
                    tpl["style"],
                    tpl["scene"],
                    tpl["template_type"],
                    1 if tpl.get("has_3d") else 0,
                    tpl.get("preview_url"),
                    tpl.get("local_path"),
                    json.dumps(tpl.get("recommended_for", []), ensure_ascii=False),
                    json.dumps(tpl.get("data_slots", []), ensure_ascii=False),
                    json.dumps(tpl.get("tags", []), ensure_ascii=False),
                    tpl.get("priority", 50),
                    now,
                    now,
                ),
            )
            count += 1
        conn.commit()
    return count


def get_template_stats() -> dict:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM dashboard_templates WHERE is_enabled = 1")
        total = cursor.fetchone()[0]
        cursor.execute(
            "SELECT style, COUNT(*) FROM dashboard_templates WHERE is_enabled = 1 GROUP BY style"
        )
        by_style = {r[0]: r[1] for r in cursor.fetchall()}
        cursor.execute(
            "SELECT scene, COUNT(*) FROM dashboard_templates WHERE is_enabled = 1 GROUP BY scene"
        )
        by_scene = {r[0]: r[1] for r in cursor.fetchall()}
        cursor.execute(
            "SELECT COUNT(*) FROM dashboard_templates WHERE has_3d = 1 AND is_enabled = 1"
        )
        count_3d = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM dashboard_templates WHERE template_type = 'jinja2_native'"
        )
        native = cursor.fetchone()[0]
    return {
        "total": total,
        "by_style": by_style,
        "by_scene": by_scene,
        "count_3d": count_3d,
        "count_native_renderable": native,
    }
