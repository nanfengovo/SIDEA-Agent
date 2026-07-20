"""大屏看板模板存储与 CRUD"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from infra.database import get_connection

DB_PATH = "config.db"


def _row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for key in ("recommended_for", "data_slots", "tags", "dashboard_json"):
        if key in d and isinstance(d[key], str) and key != "dashboard_json":
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
        elif key == "dashboard_json" and isinstance(d.get(key), str) and d[key]:
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    if "has_3d" in d:
        d["has_3d"] = bool(d["has_3d"])
    if "is_enabled" in d:
        d["is_enabled"] = bool(d["is_enabled"])
    return d


def resolve_template_id(template_id_or_alias: str) -> str | None:
    tid = template_id_or_alias.strip()
    with get_connection(DB_PATH) as conn:
        row = conn.execute(
            "SELECT template_id FROM dashboard_templates WHERE template_id = ? AND is_enabled = 1",
            (tid,),
        ).fetchone()
        if row:
            return row["template_id"]
        alias = conn.execute(
            "SELECT template_id FROM dashboard_template_aliases WHERE alias = ?",
            (tid,),
        ).fetchone()
        if alias:
            return alias["template_id"]
        # 按名称模糊匹配
        row = conn.execute(
            "SELECT template_id FROM dashboard_templates WHERE name = ? AND is_enabled = 1",
            (tid,),
        ).fetchone()
        return row["template_id"] if row else None


def get_template(template_id: str) -> dict | None:
    resolved = resolve_template_id(template_id) or template_id
    with get_connection(DB_PATH) as conn:
        row = conn.execute(
            "SELECT * FROM dashboard_templates WHERE template_id = ?",
            (resolved,),
        ).fetchone()
        tpl = _row(row)
        if tpl:
            cat = conn.execute(
                "SELECT name FROM dashboard_categories WHERE category_id = ?",
                (tpl.get("category_id"),),
            ).fetchone()
            tpl["category_name"] = cat["name"] if cat else tpl.get("category_id")
        return tpl


def list_categories() -> list[dict]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT c.*, COUNT(t.template_id) AS template_count
            FROM dashboard_categories c
            LEFT JOIN dashboard_templates t ON t.category_id = c.category_id AND t.is_enabled = 1
            WHERE c.is_enabled = 1
            GROUP BY c.category_id
            ORDER BY c.sort_order, c.name
            """
        ).fetchall()
        return [dict(r) for r in rows]


def list_templates(
    *,
    category_id: str | None = None,
    style: str | None = None,
    scene: str | None = None,
    has_3d: bool | None = None,
    keyword: str | None = None,
    include_disabled: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    conds = ["1=1"] if include_disabled else ["t.is_enabled = 1"]
    params: list[Any] = []
    if category_id:
        conds.append("t.category_id = ?")
        params.append(category_id)
    if style:
        conds.append("t.style = ?")
        params.append(style)
    if scene:
        conds.append("t.scene = ?")
        params.append(scene)
    if has_3d is not None:
        conds.append("t.has_3d = ?")
        params.append(1 if has_3d else 0)
    if keyword:
        conds.append("(t.name LIKE ? OR t.template_id LIKE ? OR t.tags LIKE ?)")
        like = f"%{keyword}%"
        params.extend([like, like, like])
    where = " AND ".join(conds)
    with get_connection(DB_PATH) as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM dashboard_templates t WHERE {where}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT t.*, c.name AS category_name
            FROM dashboard_templates t
            LEFT JOIN dashboard_categories c ON c.category_id = t.category_id
            WHERE {where}
            ORDER BY t.priority DESC, t.name
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        items = []
        for r in rows:
            item = _row(r)
            if item and isinstance(item.get("dashboard_json"), dict):
                # 列表接口不返回完整 JSON，减小 payload
                item["has_dashboard_json"] = True
                del item["dashboard_json"]
            elif item:
                item["has_dashboard_json"] = bool(r["dashboard_json"])
            items.append(item)
        return {"total": total, "items": items, "limit": limit, "offset": offset}


def create_template(data: dict) -> dict:
    now = datetime.now().isoformat()
    tid = data["template_id"]
    with get_connection(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO dashboard_templates (
                template_id, category_id, name, description, style, scene,
                template_type, has_3d, preview_url, local_path, dashboard_json,
                source_id, recommended_for, data_slots, tags, priority, is_enabled,
                created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                tid,
                data.get("category_id", "general"),
                data["name"],
                data.get("description", ""),
                data.get("style", "tech-blue"),
                data.get("scene", "general"),
                data.get("template_type", "json_dashboard"),
                1 if data.get("has_3d") else 0,
                data.get("preview_url"),
                data.get("local_path"),
                json.dumps(data["dashboard_json"], ensure_ascii=False)
                if isinstance(data.get("dashboard_json"), (dict, list))
                else data.get("dashboard_json"),
                data.get("source_id", "sidea"),
                json.dumps(data.get("recommended_for", []), ensure_ascii=False),
                json.dumps(data.get("data_slots", []), ensure_ascii=False),
                json.dumps(data.get("tags", []), ensure_ascii=False),
                data.get("priority", 50),
                1 if data.get("is_enabled", True) else 0,
                now,
                now,
            ),
        )
        for alias in data.get("aliases") or []:
            conn.execute(
                "INSERT OR REPLACE INTO dashboard_template_aliases (alias, template_id) VALUES (?,?)",
                (alias, tid),
            )
        conn.commit()
    return get_template(tid) or {}


def update_template(template_id: str, data: dict) -> dict | None:
    existing = get_template(template_id)
    if not existing:
        return None
    now = datetime.now().isoformat()
    fields = []
    params: list[Any] = []
    mapping = {
        "category_id": "category_id",
        "name": "name",
        "description": "description",
        "style": "style",
        "scene": "scene",
        "template_type": "template_type",
        "preview_url": "preview_url",
        "local_path": "local_path",
        "source_id": "source_id",
        "priority": "priority",
    }
    for key, col in mapping.items():
        if key in data:
            fields.append(f"{col} = ?")
            params.append(data[key])
    if "has_3d" in data:
        fields.append("has_3d = ?")
        params.append(1 if data["has_3d"] else 0)
    if "is_enabled" in data:
        fields.append("is_enabled = ?")
        params.append(1 if data["is_enabled"] else 0)
    for jkey in ("recommended_for", "data_slots", "tags"):
        if jkey in data:
            fields.append(f"{jkey} = ?")
            params.append(json.dumps(data[jkey], ensure_ascii=False))
    if "dashboard_json" in data:
        fields.append("dashboard_json = ?")
        val = data["dashboard_json"]
        params.append(json.dumps(val, ensure_ascii=False) if isinstance(val, (dict, list)) else val)
    if not fields:
        return existing
    fields.append("updated_at = ?")
    params.append(now)
    params.append(template_id)
    with get_connection(DB_PATH) as conn:
        conn.execute(
            f"UPDATE dashboard_templates SET {', '.join(fields)} WHERE template_id = ?",
            params,
        )
        if "aliases" in data:
            conn.execute(
                "DELETE FROM dashboard_template_aliases WHERE template_id = ?",
                (template_id,),
            )
            for alias in data["aliases"]:
                conn.execute(
                    "INSERT OR REPLACE INTO dashboard_template_aliases (alias, template_id) VALUES (?,?)",
                    (alias, template_id),
                )
        conn.commit()
    return get_template(template_id)


def delete_template(template_id: str) -> bool:
    with get_connection(DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM dashboard_templates WHERE template_id = ?",
            (template_id,),
        )
        conn.commit()
        return cur.rowcount > 0


def get_styles() -> list[str]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT DISTINCT style FROM dashboard_templates WHERE is_enabled = 1 ORDER BY style"
        ).fetchall()
        return [r[0] for r in rows]


def get_stats() -> dict:
    with get_connection(DB_PATH) as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM dashboard_templates WHERE is_enabled = 1"
        ).fetchone()[0]
        count_3d = conn.execute(
            "SELECT COUNT(*) FROM dashboard_templates WHERE has_3d = 1 AND is_enabled = 1"
        ).fetchone()[0]
        by_cat = conn.execute(
            """
            SELECT c.name, COUNT(t.template_id)
            FROM dashboard_categories c
            LEFT JOIN dashboard_templates t ON t.category_id = c.category_id AND t.is_enabled = 1
            GROUP BY c.category_id ORDER BY c.sort_order
            """
        ).fetchall()
        by_style = conn.execute(
            "SELECT style, COUNT(*) FROM dashboard_templates WHERE is_enabled = 1 GROUP BY style"
        ).fetchall()
    return {
        "total": total,
        "count_3d": count_3d,
        "by_category": {r[0]: r[1] for r in by_cat},
        "by_style": {r[0]: r[1] for r in by_style},
    }
