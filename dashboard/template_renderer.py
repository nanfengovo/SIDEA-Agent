"""大屏模板渲染 — JSON 数据注入"""
from __future__ import annotations

import copy
import json
import uuid
from datetime import datetime
from pathlib import Path

from dashboard.store import get_template
from infra.database import get_connection

OUTPUT_ROOT = Path(__file__).parent.parent / "output" / "dashboards"
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)


def _deep_merge(base: dict, overlay: dict) -> dict:
    result = copy.deepcopy(base)
    for k, v in overlay.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def render_dashboard(template_id: str, data: dict | None = None, *, save: bool = True) -> dict:
    tpl = get_template(template_id)
    if not tpl:
        raise ValueError(f"模板不存在: {template_id}")

    dashboard_json = tpl.get("dashboard_json")
    if not dashboard_json:
        return {
            "render_type": "external",
            "template_id": template_id,
            "preview_url": tpl.get("preview_url"),
            "message": "无 dashboard_json，请使用 preview_url",
        }

    merged = _deep_merge(dashboard_json, data or {}) if data else dashboard_json
    render_id = str(uuid.uuid4())[:8]
    output_path = None

    if save:
        output_path = OUTPUT_ROOT / f"{template_id}_{render_id}.json"
        output_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    now = datetime.now().isoformat()
    with get_connection("config.db") as conn:
        conn.execute(
            """
            INSERT INTO dashboard_render_history (render_id, template_id, data_payload, output_path, status, created_at)
            VALUES (?,?,?,?,?,?)
            """,
            (render_id, template_id, json.dumps(data or {}, ensure_ascii=False), str(output_path) if output_path else None, "success", now),
        )
        conn.commit()

    return {
        "render_id": render_id,
        "template_id": template_id,
        "template_name": tpl["name"],
        "render_type": "json_dashboard",
        "dashboard": merged,
        "output_path": str(output_path) if output_path else None,
        "preview_url": f"/api/templates/{template_id}",
    }
