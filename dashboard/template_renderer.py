"""
大屏模板渲染器 — 将 Agent/ABP 数据注入模板槽位，生成可展示 HTML
本地模型负责分析数据，模板负责视觉上限
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from dashboard.template_manager import get_template
from infra.database import get_connection

TEMPLATES_ROOT = Path(__file__).parent / "templates"
OUTPUT_ROOT = Path(__file__).parent.parent / "output" / "dashboards"
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

# 各风格主题 CSS 变量
STYLE_THEMES: dict[str, dict[str, str]] = {
    "tech-blue": {
        "bg": "#0a1628",
        "panel": "rgba(6, 30, 60, 0.85)",
        "border": "#00d4ff",
        "accent": "#00d4ff",
        "accent2": "#0077cc",
        "text": "#e0f4ff",
        "glow": "0 0 20px rgba(0, 212, 255, 0.4)",
    },
    "cyberpunk": {
        "bg": "#0d0221",
        "panel": "rgba(20, 0, 40, 0.9)",
        "border": "#ff00ff",
        "accent": "#ff00ff",
        "accent2": "#00ffff",
        "text": "#f0e6ff",
        "glow": "0 0 25px rgba(255, 0, 255, 0.5)",
    },
    "dark-gold": {
        "bg": "#1a1408",
        "panel": "rgba(30, 22, 8, 0.9)",
        "border": "#c9a227",
        "accent": "#e8c547",
        "accent2": "#8b6914",
        "text": "#f5ecd7",
        "glow": "0 0 20px rgba(201, 162, 39, 0.35)",
    },
    "industrial": {
        "bg": "#1c1c1e",
        "panel": "rgba(40, 40, 42, 0.92)",
        "border": "#ff9500",
        "accent": "#ff9500",
        "accent2": "#86868b",
        "text": "#f5f5f7",
        "glow": "0 0 15px rgba(255, 149, 0, 0.3)",
    },
    "holographic": {
        "bg": "#050510",
        "panel": "rgba(10, 20, 40, 0.75)",
        "border": "#64ffda",
        "accent": "#64ffda",
        "accent2": "#7c4dff",
        "text": "#e8f5ff",
        "glow": "0 0 30px rgba(100, 255, 218, 0.45)",
    },
    "green-matrix": {
        "bg": "#000a00",
        "panel": "rgba(0, 20, 0, 0.88)",
        "border": "#00ff41",
        "accent": "#00ff41",
        "accent2": "#008f11",
        "text": "#c8ffc8",
        "glow": "0 0 20px rgba(0, 255, 65, 0.35)",
    },
    "red-alert": {
        "bg": "#1a0505",
        "panel": "rgba(40, 8, 8, 0.9)",
        "border": "#ff3b30",
        "accent": "#ff3b30",
        "accent2": "#ff6b6b",
        "text": "#ffe8e8",
        "glow": "0 0 25px rgba(255, 59, 48, 0.45)",
    },
    "minimalist": {
        "bg": "#f5f5f7",
        "panel": "rgba(255, 255, 255, 0.95)",
        "border": "#d2d2d7",
        "accent": "#0071e3",
        "accent2": "#86868b",
        "text": "#1d1d1f",
        "glow": "0 2px 12px rgba(0, 0, 0, 0.08)",
    },
}


def _default_demo_data() -> dict[str, Any]:
    """演示/缺省数据 — Agent 未提供时使用"""
    return {
        "title": "RCS 智能监控驾驶舱",
        "subtitle": "SIDEA Agent · 自动化诊断与效率分析",
        "shift_name": "早班 08:00-16:00",
        "composite_automation_rate": "87.6%",
        "task_completion_rate": "94.2%",
        "manual_intervention_rate": "2.1%",
        "auto_recovery_rate": "91.5%",
        "agv_utilization": "78.3%",
        "erack_utilization": "82.0%",
        "active_alarms": "3",
        "footer_note": f"生成时间 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · SIDEA",
        "kpi_cards": [
            {"label": "综合自动化率", "value": "87.6%", "trend": "+2.3%"},
            {"label": "任务完成", "value": "1,284", "trend": "+156"},
            {"label": "人工介入", "value": "27", "trend": "-5"},
            {"label": "活跃告警", "value": "3", "trend": "-2"},
        ],
        "trend_7d": {
            "dates": ["07-14", "07-15", "07-16", "07-17", "07-18", "07-19", "07-20"],
            "automation": [82, 84, 83, 86, 85, 88, 87.6],
            "intervention": [4.2, 3.8, 3.5, 2.9, 2.5, 2.3, 2.1],
        },
        "alarm_topn": [
            {"code": "E-PLC-001", "name": "Erack通讯超时", "count": 8},
            {"code": "E-AGV-003", "name": "AGV路径阻塞", "count": 5},
            {"code": "E-TM-002", "name": "物料状态不一致", "count": 3},
        ],
        "erack_status_map": {
            "1": {"occupied": 12, "empty": 4, "error": 1},
            "2": {"occupied": 10, "empty": 6, "error": 0},
        },
    }


def _merge_data(data: dict | None) -> dict[str, Any]:
    base = _default_demo_data()
    if data:
        for k, v in data.items():
            if v is not None and v != "":
                if isinstance(v, (dict, list)):
                    base[k] = v
                else:
                    base[k] = str(v)
    return base


def _load_native_html(template_id: str) -> str | None:
    tpl = get_template(template_id)
    if not tpl or tpl.get("template_type") != "jinja2_native":
        return None
    local_path = tpl.get("local_path")
    if not local_path:
        return None
    full = TEMPLATES_ROOT / local_path
    if full.exists():
        return full.read_text(encoding="utf-8")
    # 回退到通用模板
    fallback = TEMPLATES_ROOT / "native" / "rcs_dashboard_universal.html"
    if fallback.exists():
        return fallback.read_text(encoding="utf-8")
    return None


def render_dashboard(
    template_id: str,
    data: dict | None = None,
    *,
    save: bool = True,
) -> dict[str, Any]:
    """
    渲染大屏 — 原生模板直接 HTML 替换；外部模板返回预览链接 + 数据绑定说明
    """
    tpl = get_template(template_id)
    if not tpl:
        raise ValueError(f"模板不存在: {template_id}")

    merged = _merge_data(data)
    style = tpl.get("style", "tech-blue")
    theme = STYLE_THEMES.get(style, STYLE_THEMES["tech-blue"])
    render_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    if tpl.get("template_type") == "jinja2_native":
        html_template = _load_native_html(template_id)
        if html_template:
            html = _render_jinja(html_template, merged, theme, tpl)
            output_path = None
            if save:
                output_path = OUTPUT_ROOT / f"{template_id}_{render_id}.html"
                output_path.write_text(html, encoding="utf-8")
            _save_render_history(template_id, render_id, merged, str(output_path), "success")
            return {
                "render_id": render_id,
                "template_id": template_id,
                "template_name": tpl["name"],
                "render_type": "native_html",
                "output_path": str(output_path) if output_path else None,
                "preview_url": f"/api/dashboard/output/{template_id}_{render_id}.html",
                "html_length": len(html),
                "message": "原生模板渲染成功，数据已注入槽位",
            }

    # 外部模板（BigDataView / 数字孪生 / GoView 等）— 返回绑定方案
    binding_guide = _build_binding_guide(tpl, merged)
    _save_render_history(template_id, render_id, merged, None, "external_guide")
    return {
        "render_id": render_id,
        "template_id": template_id,
        "template_name": tpl["name"],
        "render_type": "external_template",
        "preview_url": tpl.get("preview_url"),
        "source_repo": _source_repo(tpl.get("source_id")),
        "data_binding": binding_guide,
        "has_3d": tpl.get("has_3d", False),
        "message": (
            "外部模板需克隆源码后按 data_binding 映射注入数据。"
            "建议优先使用 jinja2_native 类型模板可一键渲染。"
        ),
    }


def _render_jinja(html_template: str, data: dict, theme: dict, tpl: dict) -> str:
    """简单 {{key}} 占位符替换，避免引入 jinja2 依赖"""
    trend_json = json.dumps(data.get("trend_7d", {}), ensure_ascii=False)
    alarm_json = json.dumps(data.get("alarm_topn", []), ensure_ascii=False)
    kpi_json = json.dumps(data.get("kpi_cards", []), ensure_ascii=False)
    erack_json = json.dumps(data.get("erack_status_map", {}), ensure_ascii=False)

    replacements = {
        "{{title}}": data.get("title", ""),
        "{{subtitle}}": data.get("subtitle", ""),
        "{{shift_name}}": data.get("shift_name", ""),
        "{{composite_automation_rate}}": data.get("composite_automation_rate", "--"),
        "{{task_completion_rate}}": data.get("task_completion_rate", "--"),
        "{{manual_intervention_rate}}": data.get("manual_intervention_rate", "--"),
        "{{auto_recovery_rate}}": data.get("auto_recovery_rate", "--"),
        "{{agv_utilization}}": data.get("agv_utilization", "--"),
        "{{erack_utilization}}": data.get("erack_utilization", "--"),
        "{{active_alarms}}": data.get("active_alarms", "0"),
        "{{footer_note}}": data.get("footer_note", ""),
        "{{style_name}}": tpl.get("style", "tech-blue"),
        "{{template_name}}": tpl.get("name", ""),
        "{{theme_bg}}": theme["bg"],
        "{{theme_panel}}": theme["panel"],
        "{{theme_border}}": theme["border"],
        "{{theme_accent}}": theme["accent"],
        "{{theme_accent2}}": theme["accent2"],
        "{{theme_text}}": theme["text"],
        "{{theme_glow}}": theme["glow"],
        "{{trend_7d_json}}": trend_json,
        "{{alarm_topn_json}}": alarm_json,
        "{{kpi_cards_json}}": kpi_json,
        "{{erack_status_json}}": erack_json,
        "{{has_3d}}": "true" if tpl.get("has_3d") else "false",
    }
    result = html_template
    for k, v in replacements.items():
        result = result.replace(k, str(v))
    return result


def _build_binding_guide(tpl: dict, data: dict) -> list[dict]:
    slots = tpl.get("data_slots") or []
    guide = []
    for slot in slots:
        guide.append({
            "slot": slot,
            "value": data.get(slot),
            "hint": _slot_hint(slot),
        })
    return guide


def _slot_hint(slot: str) -> str:
    hints = {
        "title": "大屏顶部标题 DOM / ECharts title.text",
        "chart_main": "主图表区域 ECharts setOption",
        "erack_3d_config": "Three.js 场景 Erack 模型布局 JSON",
        "scene_api_endpoint": "数字孪生场景 API 地址（OneTwin/Meteor3D）",
    }
    return hints.get(slot, "对应模板中的数据展示区域")


def _source_repo(source_id: str | None) -> str | None:
    from dashboard.template_manager import list_sources

    for s in list_sources():
        if s.get("source_id") == source_id:
            return s.get("repo_url")
    return None


def _save_render_history(
    template_id: str,
    render_id: str,
    data: dict,
    output_path: str | None,
    status: str,
) -> None:
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO dashboard_render_history
            (render_id, template_id, data_payload, output_path, status, created_at)
            VALUES (?,?,?,?,?,?)
            """,
            (
                render_id,
                template_id,
                json.dumps(data, ensure_ascii=False),
                output_path,
                status,
                now,
            ),
        )
        conn.commit()
