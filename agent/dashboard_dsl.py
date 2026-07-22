"""Dashboard DSL v2 — widget registry + data-binding contract.

Design goals
------------
- Visual ceiling is owned by frontend React widgets (HTML/CSS/ECharts/PixiJS/Three.js),
  not by LLM-authored ECharts option blobs.
- LLM / pipeline only produce a short declarative document:
  template + layout(widgets) + pure business data.
- Small models pick a template and fill data; commercial models may customize
  layout and pass widget props. ``custom_echarts`` remains an escape hatch.

Legacy Panel Array (type=dashboard, panels[].option) still works via
``legacy_panels_to_dsl`` on the frontend / ``from_legacy_panels`` here.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

DSL_VERSION = 2

WidgetId = Literal[
    "dashboard_header",
    "kpi_strip",
    "gauge_pair",
    "trend_combo",
    "status_donut",
    "amr_floor_map",
    "amr_iso_map",
    "bar3d_load",
    "custom_echarts",
]

KNOWN_TEMPLATES = (
    "gen_deep_beta",
    "gen_cyberpunk_alpha",
    "gen_glassmorphic_light",
    "gen_industrial_dark",
    "gen_neon_glow",
)


class WidgetSpan(BaseModel):
    col: int = Field(1, ge=1, le=4)
    row: int = Field(1, ge=1, le=4)


class LayoutItem(BaseModel):
    id: str
    widget: str
    data_ref: str
    title: Optional[str] = None
    title_en: Optional[str] = None
    slot: Optional[str] = None  # named slot for named templates
    span: Optional[WidgetSpan] = None
    props: Dict[str, Any] = Field(default_factory=dict)


class DashboardDslV2(BaseModel):
    type: Literal["dashboard"] = "dashboard"
    dsl_version: Literal[2] = 2
    title: str = "工业监控大屏"
    title_en: str = "Industrial Dashboard"
    template: str = "freeform_grid"
    theme: str = "dark-industrial"
    layout: List[LayoutItem] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)
    insights: List[str] = Field(default_factory=list)
    i18n: Dict[str, Dict[str, str]] = Field(default_factory=dict)

    def model_dump_dashboard(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=True)


def validate_dsl(doc: Dict[str, Any]) -> tuple[bool, str]:
    """Lightweight runtime check used by goal_pipeline / demos."""
    if not isinstance(doc, dict):
        return False, "not an object"
    if doc.get("type") != "dashboard":
        return False, "type must be dashboard"
    if int(doc.get("dsl_version") or 0) != DSL_VERSION:
        return False, f"dsl_version must be {DSL_VERSION}"
    layout = doc.get("layout")
    data = doc.get("data")
    if not isinstance(layout, list) or len(layout) < 1:
        return False, "layout must be a non-empty list"
    if not isinstance(data, dict):
        return False, "data must be an object"
    for i, item in enumerate(layout):
        if not isinstance(item, dict):
            return False, f"layout[{i}] must be object"
        if not item.get("widget"):
            return False, f"layout[{i}].widget required"
        ref = item.get("data_ref")
        if not ref:
            return False, f"layout[{i}].data_ref required"
        if ref not in data:
            return False, f"data missing key '{ref}' for layout[{i}]"
    return True, "ok"


def from_legacy_panels(
    legacy: Dict[str, Any],
    *,
    template: str = "freeform_grid",
) -> Dict[str, Any]:
    """Convert existing Panel Array JSON into DSL v2 (custom_echarts widgets)."""
    panels = legacy.get("panels") or []
    layout: List[Dict[str, Any]] = []
    data: Dict[str, Any] = {}
    for i, p in enumerate(panels):
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or f"p{i}")
        ref = f"echarts_{pid}"
        option = p.get("option") or {}
        data[ref] = {"option": option}
        span = p.get("span")
        item: Dict[str, Any] = {
            "id": pid,
            "widget": "custom_echarts",
            "data_ref": ref,
            "title": p.get("title"),
            "title_en": p.get("title_en"),
        }
        if isinstance(span, dict) and span.get("col"):
            item["span"] = {
                "col": int(span.get("col") or 1),
                "row": int(span.get("row") or 1),
            }
        layout.append(item)

    # Heuristic: first map-like panel → amr_floor_map widget id for future upgrade
    for item in layout:
        opt = (data.get(item["data_ref"]) or {}).get("option") or {}
        series = opt.get("series") if isinstance(opt, dict) else None
        if not isinstance(series, list):
            continue
        has_map = any(
            isinstance(s, dict)
            and (
                s.get("type") in ("effectScatter", "lines")
                or isinstance(s.get("markArea"), dict)
            )
            for s in series
        )
        if has_map:
            item["widget"] = "amr_floor_map"
            break

    title = legacy.get("title") or "工业监控大屏"
    title_en = legacy.get("title_en") or "Industrial Dashboard"
    # unwrap i18n placeholders if present
    i18n = legacy.get("i18n") if isinstance(legacy.get("i18n"), dict) else {}
    zh = i18n.get("zh-CN") if isinstance(i18n.get("zh-CN"), dict) else {}
    if isinstance(title, str) and title.startswith("T_") and zh.get(title):
        title = zh[title]

    out = {
        "type": "dashboard",
        "dsl_version": DSL_VERSION,
        "title": title,
        "title_en": title_en,
        "template": legacy.get("template") or template,
        "theme": "dark-industrial",
        "layout": layout,
        "data": data,
        "insights": legacy.get("insights") or [],
        "i18n": i18n or {},
        "_meta": {"converted_from": "legacy_panels"},
    }
    ok, reason = validate_dsl(out)
    if not ok:
        raise ValueError(f"converted DSL invalid: {reason}")
    return out


def sample_gen_deep_beta() -> Dict[str, Any]:
    """Canonical DSL v2 example for AMR command center (no ECharts options in data)."""
    return {
        "type": "dashboard",
        "dsl_version": 2,
        "title": "RCS AMR 任务执行监控大屏",
        "title_en": "RCS AMR Mission Execution Dashboard",
        "template": "gen_deep_beta",
        "theme": "dark-industrial",
        "layout": [
            {
                "id": "hdr",
                "widget": "dashboard_header",
                "data_ref": "header",
                "slot": "top",
            },
            {
                "id": "kpis",
                "widget": "kpi_strip",
                "data_ref": "kpis",
                "slot": "kpi",
                "span": {"col": 4, "row": 1},
            },
            {
                "id": "floor",
                "widget": "amr_iso_map",
                "data_ref": "floor",
                "title": "AMR 厂区实时仿真",
                "title_en": "AMR Live Floor",
                "slot": "hero",
                "span": {"col": 2, "row": 2},
            },
            {
                "id": "oee",
                "widget": "gauge_pair",
                "data_ref": "oee",
                "title": "稼动率 / 自动化率",
                "title_en": "OEE / Automation",
                "slot": "right1",
            },
            {
                "id": "status",
                "widget": "status_donut",
                "data_ref": "robot_status",
                "title": "机器人状态",
                "title_en": "Robot Status",
                "slot": "right2",
            },
            {
                "id": "eff",
                "widget": "trend_combo",
                "data_ref": "efficiency",
                "title": "任务效率趋势",
                "title_en": "Task Efficiency",
                "slot": "bottom",
                "span": {"col": 2, "row": 1},
            },
        ],
        "data": {
            "header": {
                "subtitle": "SIMULATED · DEMO",
                "status": "live",
                "clock": True,
            },
            "kpis": [
                {"label": "今日任务", "label_en": "Today Tasks", "value": 1286, "delta": "+12%", "tone": "cyan"},
                {"label": "完成率", "label_en": "Completion", "value": "96.4%", "delta": "+1.2%", "tone": "green"},
                {"label": "在线 AMR", "label_en": "Online AMR", "value": 27, "delta": "1 fault", "tone": "amber"},
                {"label": "平均响应", "label_en": "Avg Latency", "value": "1.8s", "delta": "-0.3s", "tone": "blue"},
            ],
            "floor": {
                "zones": [
                    {"id": "A", "name": "存储区 A", "x": 2, "y": 55, "w": 36, "h": 40},
                    {"id": "B", "name": "接驳区 B", "x": 42, "y": 55, "w": 30, "h": 40},
                    {"id": "C", "name": "充电区", "x": 76, "y": 70, "w": 20, "h": 25},
                    {"id": "D", "name": "缓存区", "x": 76, "y": 40, "w": 20, "h": 25},
                ],
                "robots": [
                    {"id": "AMR-01", "x": 12, "y": 70, "status": "busy"},
                    {"id": "AMR-02", "x": 28, "y": 62, "status": "busy"},
                    {"id": "AMR-03", "x": 48, "y": 75, "status": "idle"},
                    {"id": "AMR-04", "x": 55, "y": 50, "status": "fault"},
                    {"id": "AMR-05", "x": 82, "y": 80, "status": "charging"},
                    {"id": "AMR-06", "x": 35, "y": 45, "status": "busy"},
                    {"id": "AMR-07", "x": 18, "y": 48, "status": "idle"},
                    {"id": "AMR-08", "x": 68, "y": 42, "status": "busy"},
                ],
                "routes": [
                    {"id": "r1", "coords": [[12, 70], [30, 55], [52, 40]]},
                    {"id": "r2", "coords": [[28, 62], [48, 75], [82, 80]]},
                    {"id": "r3", "coords": [[35, 45], [55, 50], [68, 42]]},
                ],
            },
            "oee": {
                "left": {"label": "稼动率", "label_en": "OEE", "value": 0.82},
                "right": {"label": "自动化率", "label_en": "Automation", "value": 0.86},
            },
            "robot_status": [
                {"name": "运行中", "name_en": "Busy", "value": 18, "color": "#34d399"},
                {"name": "待机", "name_en": "Idle", "value": 6, "color": "#3b82f6"},
                {"name": "充电", "name_en": "Charging", "value": 3, "color": "#fbbf24"},
                {"name": "故障", "name_en": "Fault", "value": 1, "color": "#ef4444"},
            ],
            "efficiency": {
                "x": ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
                "series": [
                    {"name": "任务完成数", "name_en": "Tasks Done", "type": "bar", "data": [42, 55, 61, 58, 70, 66]},
                    {
                        "name": "效率%",
                        "name_en": "Efficiency %",
                        "type": "line",
                        "yAxisIndex": 1,
                        "data": [78, 81, 84, 82, 88, 86],
                    },
                ],
            },
        },
        "insights": [
            "AMR-04 处于故障态，建议优先调度附近空闲车接替任务。",
            "近 6 小时自动化率维持在 82%~88%，稼动率仍有提升空间。",
            "今日任务完成 1286，环比 +12%。",
        ],
    }


_TYPE_TO_WIDGET = {
    "amr_map": "amr_iso_map",
    "raw": "custom_echarts",
    "combo": "trend_combo",
    "pie": "status_donut",
    "bar3d": "bar3d_load",
    "bar": "custom_echarts",
    "line": "custom_echarts",
    "scatter": "custom_echarts",
    "heatmap": "custom_echarts",
}


def _floor_from_echarts_option(option: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Best-effort extract FloorData from a legacy AMR ECharts option."""
    if not isinstance(option, dict):
        return None
    series = option.get("series")
    if not isinstance(series, list):
        return None

    zones: List[Dict[str, Any]] = []
    robots: List[Dict[str, Any]] = []
    routes: List[Dict[str, Any]] = []
    status_alias = {
        "正常": "busy",
        "运行": "busy",
        "busy": "busy",
        "暂停": "idle",
        "待机": "idle",
        "空闲": "idle",
        "idle": "idle",
        "充电": "charging",
        "charging": "charging",
        "故障": "fault",
        "fault": "fault",
    }

    for s in series:
        if not isinstance(s, dict):
            continue
        st = status_alias.get(str(s.get("name") or "").strip(), "")
        mark = s.get("markArea")
        if isinstance(mark, dict):
            for i, pair in enumerate(mark.get("data") or []):
                if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                    continue
                a, b = pair[0], pair[1]
                if not isinstance(a, dict) or not isinstance(b, dict):
                    continue
                try:
                    x0, y0 = float(a.get("xAxis")), float(a.get("yAxis"))
                    x1, y1 = float(b.get("xAxis")), float(b.get("yAxis"))
                except (TypeError, ValueError):
                    continue
                name = str(a.get("name") or f"Z{i}")
                zones.append(
                    {
                        "id": name,
                        "name": name,
                        "x": min(x0, x1),
                        "y": min(y0, y1),
                        "w": abs(x1 - x0),
                        "h": abs(y1 - y0),
                    }
                )
        if s.get("type") in ("effectScatter", "scatter") and st:
            for d in s.get("data") or []:
                if not isinstance(d, dict):
                    continue
                val = d.get("value")
                if not isinstance(val, (list, tuple)) or len(val) < 2:
                    continue
                rid = str(d.get("name") or "AMR").split()[0]
                robots.append(
                    {
                        "id": rid,
                        "x": float(val[0]),
                        "y": float(val[1]),
                        "status": st,
                    }
                )
        if s.get("type") == "lines":
            for i, d in enumerate(s.get("data") or []):
                if isinstance(d, dict) and isinstance(d.get("coords"), list) and len(d["coords"]) >= 2:
                    routes.append({"id": f"r{i}", "coords": d["coords"]})

    if not robots and not zones:
        return None
    if not zones:
        zones = [
            {"id": "A", "name": "存储区 A", "x": 2, "y": 55, "w": 36, "h": 40},
            {"id": "B", "name": "接驳区 B", "x": 42, "y": 55, "w": 30, "h": 40},
        ]
    if robots and not any(r.get("status") == "fault" for r in robots):
        robots[0]["status"] = "fault"
    return {"zones": zones, "robots": robots, "routes": routes}


def _chart_to_data_blob(chart: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort structured data; fall back to embedding ECharts option."""
    t = chart.get("type")
    if t == "amr_map":
        if chart.get("zones") or chart.get("robots"):
            return {
                "zones": chart.get("zones") or [],
                "robots": chart.get("robots") or [],
                "routes": chart.get("routes") or [],
            }
    if t == "raw" and isinstance(chart.get("option"), dict):
        # Keep option for custom_echarts / amr_floor_map escape
        return {"option": chart["option"]}
    if t == "combo":
        return {
            "x": chart.get("x_data") or [],
            "series": chart.get("series") or [],
        }
    if t == "pie":
        rows = []
        for d in chart.get("data") or []:
            if isinstance(d, dict):
                rows.append(
                    {
                        "name": d.get("name") or "",
                        "name_en": d.get("name_en") or d.get("name") or "",
                        "value": d.get("value") or 0,
                    }
                )
        return rows
    if t == "bar3d":
        return {
            "x_size": chart.get("x_size") or 8,
            "y_size": chart.get("y_size") or 8,
            "data": chart.get("data") or [],
        }
    # Generic: wrap whatever we have as option via SDK-less passthrough later
    return {"option": {"_sidea_chart": chart}}


def charts_to_dsl_v2(
    layout: Dict[str, Any],
    charts: List[dict],
    *,
    template: Optional[str] = None,
    insights: Optional[List[str]] = None,
    data_source: str = "simulated",
) -> Dict[str, Any]:
    """Convert template-pipeline layout+charts into native DSL v2."""
    from tools.sidea_sdk_template import export_dashboard

    # Materialize ECharts options for panels that need custom_echarts fallback
    # by running export_dashboard into memory-like structure via temp file.
    import tempfile
    import os

    sandbox = Path("sandbox_workspace")
    sandbox.mkdir(parents=True, exist_ok=True)
    tmp = sandbox / f"_dsl_bridge_{os.getpid()}.json"
    try:
        export_dashboard(
            layout.get("title") or "工业监控大屏",
            charts,
            filename=str(tmp),
            title_en=layout.get("title_en"),
        )
        bridged = json.loads(tmp.read_text(encoding="utf-8")) if tmp.exists() else {}
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

    bridged_panels = {
        str(p.get("id") or f"p{i}"): p
        for i, p in enumerate(bridged.get("panels") or [])
        if isinstance(p, dict)
    }

    is_rcs = any(
        (c.get("type") in ("amr_map", "raw") or "AMR" in str(c.get("title") or "") or "机器人" in str(c.get("title") or ""))
        for c in charts
    )
    tpl = template or layout.get("template") or ("gen_deep_beta" if is_rcs or layout.get("composition") == "map_centric" else "gen_glassmorphic_light")

    dsl_layout: List[Dict[str, Any]] = []
    data: Dict[str, Any] = {
        "header": {
            "subtitle": data_source.upper(),
            "status": "live" if data_source == "live" else "simulated",
            "clock": True,
        },
    }
    # KPI strip from first combo / bar if present
    kpis = []
    for c in charts:
        if c.get("type") == "combo" and c.get("series"):
            for s in (c.get("series") or [])[:3]:
                vals = [v for v in (s.get("data") or []) if isinstance(v, (int, float))]
                if vals:
                    kpis.append(
                        {
                            "label": s.get("name") or "指标",
                            "label_en": s.get("name_en") or s.get("name") or "Metric",
                            "value": round(sum(vals) / len(vals), 1) if "率" in str(s.get("name") or "") else int(vals[-1]),
                            "delta": f"n={len(vals)}",
                            "tone": "cyan",
                        }
                    )
            break
    if kpis:
        data["kpis"] = kpis[:4]
        dsl_layout.append(
            {
                "id": "hdr",
                "widget": "dashboard_header",
                "data_ref": "header",
                "slot": "top",
            }
        )
        dsl_layout.append(
            {
                "id": "kpis",
                "widget": "kpi_strip",
                "data_ref": "kpis",
                "slot": "kpi",
                "span": {"col": 4, "row": 1},
            }
        )
    else:
        dsl_layout.append(
            {
                "id": "hdr",
                "widget": "dashboard_header",
                "data_ref": "header",
                "slot": "top",
            }
        )

    for i, c in enumerate(charts):
        pid = str(c.get("id") or f"p{i}")
        ctype = c.get("type") or "raw"
        # Prefer bridged option for custom rendering fidelity
        bridged_p = bridged_panels.get(pid) or {}
        option = bridged_p.get("option")
        widget = _TYPE_TO_WIDGET.get(ctype, "custom_echarts")
        if ctype == "amr_map" and (c.get("zones") or c.get("robots")):
            widget = "amr_iso_map"
            blob = _chart_to_data_blob(c)
        elif ctype in ("amr_map", "raw") and isinstance(option, dict):
            series = option.get("series") if isinstance(option.get("series"), list) else []
            map_like = any(
                isinstance(s, dict)
                and (s.get("type") in ("effectScatter", "lines") or isinstance(s.get("markArea"), dict))
                for s in series
            )
            extracted = _floor_from_echarts_option(option) if map_like else None
            if extracted:
                widget = "amr_iso_map"
                blob = extracted
            elif map_like:
                widget = "amr_floor_map"
                blob = {"option": option}
            else:
                widget = "custom_echarts"
                blob = {"option": option}
        elif widget in ("trend_combo", "status_donut", "bar3d_load") and ctype != "raw":
            blob = _chart_to_data_blob(c)
            # If structured conversion is too thin, keep option
            if widget == "trend_combo" and not blob.get("series") and option:
                widget = "custom_echarts"
                blob = {"option": option}
            elif widget == "status_donut" and not blob and option:
                widget = "custom_echarts"
                blob = {"option": option}
        else:
            blob = {"option": option} if option else _chart_to_data_blob(c)
            widget = "custom_echarts"

        ref = f"d_{pid}"
        data[ref] = blob
        item: Dict[str, Any] = {
            "id": pid,
            "widget": widget,
            "data_ref": ref,
            "title": c.get("title") or bridged_p.get("title"),
            "title_en": c.get("title_en"),
        }
        if widget in ("amr_floor_map", "amr_iso_map"):
            item["slot"] = "hero"
            item["span"] = {"col": 2, "row": 2}
        dsl_layout.append(item)

    title = layout.get("title") or "工业监控大屏"
    title_en = layout.get("title_en") or "Industrial Dashboard"
    out = {
        "type": "dashboard",
        "dsl_version": DSL_VERSION,
        "title": title,
        "title_en": title_en,
        "template": tpl,
        "theme": "dark-industrial",
        "layout": dsl_layout,
        "data": data,
        "insights": insights or [],
        "i18n": {
            "zh-CN": {"T_DASH_TITLE": title},
            "en": {"T_DASH_TITLE": title_en},
        },
        "_meta": {"source": "charts_to_dsl_v2", "data_source": data_source},
    }

    # --- Inject template visual recipe from database ---
    _VISUAL_KEYS = {"layout", "bg_css", "frame_css", "header_css", "accent_color",
                     "kpi_bg", "kpi_border", "chart_colors"}
    try:
        import sqlite3 as _sql3
        _db = os.path.join(os.path.dirname(__file__), '..', 'config.db')
        with _sql3.connect(_db) as _conn:
            _row = _conn.execute(
                "SELECT layout_config FROM dashboard_templates WHERE template_id = ?",
                (tpl,)
            ).fetchone()
        if _row and _row[0]:
            _tpl_cfg = json.loads(_row[0])
            _override = {k: _tpl_cfg[k] for k in _VISUAL_KEYS if k in _tpl_cfg}
            if _override:
                out["theme_override"] = _override
                # Also propagate layout hint from template if present
                if "layout" in _override:
                    out["template_layout"] = _override["layout"]
    except Exception:
        pass  # visual recipe injection is best-effort

    model3d_keyword = layout.get("model3d_keyword")
    if model3d_keyword:
        out["model3d_keyword"] = model3d_keyword
        try:
            import sqlite3
            import os
            db_path = os.path.join(os.path.dirname(__file__), '..', 'config.db')
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                like_query = f"%{model3d_keyword}%"
                cursor.execute("SELECT file_path FROM agent_3d_models WHERE keyword LIKE ? OR name LIKE ? ORDER BY created_at DESC", (like_query, like_query))
                row = cursor.fetchone()
                if row:
                    out["model3d_url"] = row['file_path']
        except Exception:
            pass

    ok, reason = validate_dsl(out)
    if not ok:
        # Absolute fallback: legacy conversion of bridged panels
        if bridged.get("panels"):
            return from_legacy_panels({**bridged, "title": title, "title_en": title_en, "template": tpl})
        raise ValueError(f"charts_to_dsl_v2 invalid: {reason}")
    return out


def write_dsl_file(doc: Dict[str, Any], prefix: str = "chart") -> tuple[str, Path]:
    """Persist DSL JSON under sandbox_workspace and return public URL + path."""
    from core.public_url import public_url

    sandbox = Path("sandbox_workspace")
    sandbox.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{int(time.time() * 1000)}.json"
    dest = sandbox / name
    dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return public_url(f"sandbox_workspace/{name}"), dest
