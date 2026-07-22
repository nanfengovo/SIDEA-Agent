"""SIDEA Sandbox SDK — injected into sandbox_workspace/sidea_sdk.py at runtime.

Panel Array protocol: multi-chart dashboards export as independent panels
(never cram N charts into one multi-grid option).
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional, Tuple

# 工业术语中英词典：调用方漏传 *_en 时自动兜底，保证 en 词典里没有汉字
_ZH_EN_GLOSSARY = {
    "车间实时数字孪生监控大屏": "Workshop Real-time Digital Twin Dashboard",
    "产能与缺陷追踪": "Capacity & Defect Tracking",
    "工艺能耗分布": "Process Energy Consumption",
    "刀具磨损寿命预测": "Tool Wear Life Prediction",
    "刀具磨损预测": "Tool Wear Prediction",
    "核心三轴温度阵列": "Core 3-Axis Temperature Array",
    "核心温度阵列": "Core Temperature Array",
    "高危预警": "High Risk",
    "次品率": "Defect Rate",
    "磨损度": "Wear",
    "监控大屏": "Dashboard",
    "数字孪生": "Digital Twin",
    "产能": "Capacity",
    "产量": "Output",
    "良率": "Yield",
    "冲压": "Stamping",
    "焊接": "Welding",
    "喷涂": "Painting",
    "总装": "Assembly",
    "时长": "Duration",
    "正常": "Normal",
    "温度": "Temperature",
    "能耗": "Energy",
    "车间": "Workshop",
    "机床": "Machine",
    "实时": "Real-time",
}
_GLOSSARY_KEYS = sorted(_ZH_EN_GLOSSARY, key=len, reverse=True)

_HAS_ZH = re.compile(r"[\u4e00-\u9fff]")
_BILINGUAL = re.compile(r"^(.+?)\s*[（(]([^）)]+)[）)]\s*$")


def _glossary_en(text: str) -> str:
    if text in _ZH_EN_GLOSSARY:
        return _ZH_EN_GLOSSARY[text]
    out = text
    for zh in _GLOSSARY_KEYS:
        if zh in out:
            out = out.replace(zh, _ZH_EN_GLOSSARY[zh])
    return out


_ZH_DICT_KEYS = ("zh", "zh-CN", "zh_cn", "cn", "text", "name", "title", "label", "value")
_EN_DICT_KEYS = ("en", "en-US", "en_us", "english")


def _coerce_text(value: Any, prefer: Tuple[str, ...] = _ZH_DICT_KEYS) -> str:
    """模型经常把字符串字段传成 dict/list/数字，这里统一兜底成字符串。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for k in prefer:
            v = value.get(k)
            if isinstance(v, str) and v.strip():
                return v
        for v in value.values():
            if isinstance(v, str) and v.strip():
                return v
        return ""
    if isinstance(value, (list, tuple)):
        parts = [_coerce_text(v, prefer) for v in value]
        return " ".join(p for p in parts if p)
    return str(value)


def _split_bilingual(text: Any, explicit_en: Optional[str] = None) -> Tuple[str, str]:
    """把 "产能与缺陷追踪 (Capacity & Defect Tracking)" 拆成 (中文, 英文)。

    没有括号双语时，中文照原样返回，英文优先用 explicit_en，其次词典翻译。
    """
    # 若 text 是 {"zh": ..., "en": ...} 这类字典，顺手把 en 提出来当 explicit_en
    if isinstance(text, dict) and not explicit_en:
        en_in_dict = _coerce_text(text, _EN_DICT_KEYS)
        zh_in_dict = _coerce_text(text, _ZH_DICT_KEYS)
        if en_in_dict and en_in_dict != zh_in_dict:
            explicit_en = en_in_dict
    text = _coerce_text(text).strip()
    if explicit_en is not None and not isinstance(explicit_en, str):
        explicit_en = _coerce_text(explicit_en, _EN_DICT_KEYS) or None
    if explicit_en:
        explicit_en = explicit_en.strip() or None
    m = _BILINGUAL.match(text)
    if m:
        left, right = m.group(1).strip(), m.group(2).strip()
        left_zh, right_zh = bool(_HAS_ZH.search(left)), bool(_HAS_ZH.search(right))
        # "(%)"、"(℃)" 这类单位后缀不算双语
        right_is_unit = not re.search(r"[A-Za-z\u4e00-\u9fff]{2,}", right)
        if left_zh and not right_zh and not right_is_unit:
            return left, explicit_en or right
        if left_zh and right_is_unit:
            zh_full = text
            en_left = explicit_en or _glossary_en(left)
            return zh_full, f"{en_left} ({right})"
        if right_zh and not left_zh:
            return right, explicit_en or left
    if explicit_en:
        return text, explicit_en
    if _HAS_ZH.search(text):
        return text, _glossary_en(text)
    return text, text


def _reg(i18n_zh: dict, i18n_en: dict, key: str, text: Any, explicit_en: Any = None) -> str:
    zh, en = _split_bilingual(text, explicit_en)
    i18n_zh[key] = zh
    i18n_en[key] = en
    return key


def export_echarts(
    title: str,
    xlabel: str,
    ylabel: str,
    x_data: list,
    y_data: list,
    filename: str = "chart_option.json",
    title_en: Optional[str] = None,
    xlabel_en: Optional[str] = None,
    ylabel_en: Optional[str] = None,
):
    if not title or not xlabel or not ylabel:
        raise ValueError("架构规范拦截：必须提供 title, xlabel 和 ylabel，禁止生成无语义图表！")
    i18n_zh: Dict[str, Any] = {}
    i18n_en: Dict[str, Any] = {}
    _reg(i18n_zh, i18n_en, "T_TITLE", title, title_en)
    _reg(i18n_zh, i18n_en, "T_XAXIS", xlabel, xlabel_en)
    _reg(i18n_zh, i18n_en, "T_YAXIS", ylabel, ylabel_en)
    option = {
        "i18n": {"zh-CN": i18n_zh, "en": i18n_en},
        "option": {
            "backgroundColor": "transparent",
            "title": {"text": "T_TITLE", "left": "center", "textStyle": {"color": "#e2e8f0"}},
            "tooltip": {"trigger": "axis"},
            "grid": {"left": "8%", "right": "8%", "bottom": "12%", "containLabel": True},
            "xAxis": {
                "type": "category",
                "name": "T_XAXIS",
                "data": x_data,
                "axisLabel": {"color": "#94a3b8"},
            },
            "yAxis": {
                "type": "value",
                "name": "T_YAXIS",
                "axisLabel": {"color": "#94a3b8"},
                "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.15)"}},
            },
            "series": [{"data": y_data, "type": "line", "smooth": True, "itemStyle": {"color": "#22d3ee"}}],
        },
    }
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(option, f, ensure_ascii=False, indent=2)


def validate_echarts(option: dict):
    """Validate a single panel option — dual-Y on one grid is allowed."""
    series = option.get("series", [])
    if not isinstance(series, list):
        series = [series] if series else []
    grid = option.get("grid", [])
    if not isinstance(grid, list):
        grid = [grid] if grid else []

    has_3d = any((s.get("type") or "").lower().endswith("3d") for s in series)
    if has_3d and not option.get("grid3D"):
        raise ValueError(
            "LayoutError: 包含 3D 系列但缺少 grid3D/xAxis3D/yAxis3D/zAxis3D。"
            "请使用 export_dashboard(type='bar3d') 或补全 3D 坐标系。"
        )

    non_pie = [s for s in series if s.get("type") in ("line", "bar", "scatter", "heatmap")]
    # Count distinct cartesian grids by xAxisIndex (dual-Y shares the same grid)
    grid_indices = set(s.get("xAxisIndex", 0) for s in non_pie)
    if len(grid_indices) > max(len(grid), 1):
        raise ValueError(
            f"LayoutCollisionError: 引用了 {len(grid_indices)} 个笛卡尔网格，"
            f"但只定义了 {len(grid)} 个 grid。请改用 export_dashboard 按面板导出。"
        )
    return True


def _build_combo_option(chart: dict, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    x_data = chart.get("x_data") or chart.get("categories") or []
    series_in = chart.get("series") or []
    if len(series_in) < 2:
        raise ValueError("combo 面板至少需要 2 个 series（左轴 + 右轴）")
    if not x_data:
        # 模型常漏 x_data：按最长 series 长度补序号
        maxlen = max((len(s.get("data") or []) for s in series_in if isinstance(s, dict)), default=0)
        x_data = [str(i + 1) for i in range(maxlen)]

    y0 = chart.get("y_name") or (series_in[0].get("name") if series_in else "Y1")
    y1 = chart.get("y_name_right") or (series_in[1].get("name") if len(series_in) > 1 else "Y2")
    y0_en = chart.get("y_name_en") or series_in[0].get("name_en") or y0
    y1_en = chart.get("y_name_right_en") or series_in[1].get("name_en") or y1

    y0_key, y1_key = f"{title_key}_Y0", f"{title_key}_Y1"
    _reg(i18n_zh, i18n_en, y0_key, y0, None if y0_en == y0 else y0_en)
    _reg(i18n_zh, i18n_en, y1_key, y1, None if y1_en == y1 else y1_en)

    out_series = []
    legend_keys = []
    for i, s in enumerate(series_in):
        s_key = f"{title_key}_S{i}"
        name = s.get("name") or f"S{i}"
        _reg(i18n_zh, i18n_en, s_key, name, s.get("name_en"))
        legend_keys.append(s_key)
        y_idx = int(s.get("yAxisIndex", 0 if i == 0 else 1))
        out_series.append(
            {
                "name": s_key,
                "type": s.get("type", "line" if y_idx == 0 else "bar"),
                "yAxisIndex": y_idx,
                "data": s.get("data", []),
                "smooth": s.get("type", "line") == "line",
                "itemStyle": {"color": s.get("color") or ("#22d3ee" if y_idx == 0 else "#f97316")},
            }
        )

    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "cross"}},
        "legend": {
            "data": legend_keys,
            "top": 32,
            "textStyle": {"color": "#94a3b8", "fontSize": 11},
        },
        "grid": {"top": 72, "left": "10%", "right": "12%", "bottom": "12%", "containLabel": True},
        "xAxis": {
            "type": "category",
            "data": x_data,
            "axisLabel": {"color": "#94a3b8"},
            "axisLine": {"lineStyle": {"color": "#334155"}},
        },
        "yAxis": [
            {
                "type": "value",
                "name": y0_key,
                "position": "left",
                "axisLabel": {"color": "#22d3ee"},
                "nameTextStyle": {"color": "#22d3ee"},
                "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.12)"}},
            },
            {
                "type": "value",
                "name": y1_key,
                "position": "right",
                "axisLabel": {"color": "#f97316"},
                "nameTextStyle": {"color": "#f97316"},
                "splitLine": {"show": False},
            },
        ],
        "series": out_series,
    }


_PIE_DEFAULT_NAMES = [
    ("冲压", "Stamping"),
    ("焊接", "Welding"),
    ("喷涂", "Painting"),
    ("总装", "Assembly"),
    ("机加", "Machining"),
    ("质检", "QC"),
]


def _as_pie_rows(raw: Any) -> list:
    """把各种乱七八糟的 pie.data 规整成 [{name, name_en?, value}, ...]。"""
    if not isinstance(raw, list):
        return []
    rows = []
    for i, item in enumerate(raw):
        if isinstance(item, dict):
            name = item.get("name") or item.get("label") or item.get("text")
            if isinstance(name, dict):
                name = _coerce_text(name)
            val = item.get("value", item.get("v", item.get("y", 0)))
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = 0.0
            rows.append({"name": name or "", "name_en": item.get("name_en"), "value": val})
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            try:
                val = float(item[1])
            except (TypeError, ValueError):
                val = 0.0
            rows.append({"name": _coerce_text(item[0]), "value": val})
        elif isinstance(item, (int, float)):
            rows.append({"name": "", "value": float(item)})
        elif isinstance(item, str):
            rows.append({"name": item, "value": 1.0})
    return rows


def _named_pie_rows(rows: list) -> list:
    """补缺省名称并合并同名项。不丢任何数据。"""
    if not rows:
        return [
            {"name": zh, "name_en": en, "value": v}
            for (zh, en), v in zip(_PIE_DEFAULT_NAMES[:4], (32, 28, 22, 18))
        ]
    named = []
    anon_i = 0
    for r in rows:
        name = (r.get("name") or "").strip()
        if not name:
            if anon_i < len(_PIE_DEFAULT_NAMES):
                zh, en = _PIE_DEFAULT_NAMES[anon_i]
                named.append({"name": zh, "name_en": r.get("name_en") or en, "value": r["value"]})
            else:
                named.append({"name": f"类别{anon_i + 1}", "name_en": f"Cat {anon_i + 1}", "value": r["value"]})
            anon_i += 1
        else:
            named.append(r)

    merged: Dict[str, dict] = {}
    for r in named:
        key = r["name"]
        if key in merged:
            merged[key]["value"] += float(r["value"])
        else:
            merged[key] = {"name": r["name"], "name_en": r.get("name_en"), "value": float(r["value"])}
    out = list(merged.values())
    out.sort(key=lambda x: x["value"], reverse=True)
    return out


def _build_category_bar_option(rows: list, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    """类别过多时的占比图排版：横向条形图 + dataZoom 滚动，保留全部类别。"""
    total = sum(r["value"] for r in rows) or 1.0
    cat_keys = []
    values = []
    for i, r in enumerate(rows):
        k = f"{title_key}_N{i}"
        _reg(i18n_zh, i18n_en, k, r["name"], r.get("name_en"))
        cat_keys.append(k)
        values.append(round(r["value"], 2))

    # 视窗默认显示占比最高的 10 条，其余滚动查看
    window = min(10, len(rows))
    start_pct = 0 if len(rows) <= window else round((1 - window / len(rows)) * 100)

    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {
            "trigger": "axis",
            "axisPointer": {"type": "shadow"},
            "formatter": "{b}: {c}",
        },
        "grid": {"top": 40, "left": 8, "right": 56, "bottom": 8, "containLabel": True},
        "xAxis": {
            "type": "value",
            "axisLabel": {"color": "#94a3b8", "fontSize": 10},
            "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.12)"}},
        },
        "yAxis": {
            # 倒序让最大值排最上面
            "type": "category",
            "data": list(reversed(cat_keys)),
            "axisLabel": {"color": "#94a3b8", "fontSize": 10, "width": 72, "overflow": "truncate"},
        },
        "dataZoom": [
            {
                "type": "slider",
                "yAxisIndex": 0,
                "right": 6,
                "width": 14,
                "start": start_pct,
                "end": 100,
                "borderColor": "rgba(148,163,184,0.2)",
                "fillerColor": "rgba(34,211,238,0.15)",
                "handleStyle": {"color": "#22d3ee"},
                "textStyle": {"color": "#94a3b8", "fontSize": 9},
            },
            {"type": "inside", "yAxisIndex": 0},
        ],
        "series": [
            {
                "name": title_key,
                "type": "bar",
                "data": list(reversed(values)),
                "barMaxWidth": 14,
                "itemStyle": {"color": "#22d3ee", "borderRadius": [0, 4, 4, 0]},
                "label": {
                    "show": True,
                    "position": "right",
                    "color": "#94a3b8",
                    "fontSize": 9,
                    "formatter": "{c}",
                },
            }
        ],
        # 提示前端/使用者：这是占比图的高基数形态
        "_sidea_variant": "category-bar",
        "_sidea_total": round(total, 2),
    }


def _build_pie_option(chart: dict, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    """占比面板的自适应排版（不丢数据）：
    - ≤4 类：环形图 + 右侧竖排图例
    - 5~12 类：环形图 + 底部滚动图例，小扇区不画内标签
    - >12 类：自动改用横向条形图 + 滚动条（饼图在该基数下不可读）
    """
    rows = _named_pie_rows(_as_pie_rows(chart.get("data")))
    n = len(rows)

    if n > 12:
        return _build_category_bar_option(rows, title_key, i18n_zh, i18n_en)

    total = sum(r["value"] for r in rows) or 1.0
    pie_data = []
    for i, item in enumerate(rows):
        n_key = f"{title_key}_N{i}"
        _reg(i18n_zh, i18n_en, n_key, item["name"], item.get("name_en"))
        entry: Dict[str, Any] = {"name": n_key, "value": item["value"]}
        # 占比 <3% 的小扇区：不画内部百分比标签（画了也挤成一团）
        if item["value"] / total < 0.03:
            entry["label"] = {"show": False}
        pie_data.append(entry)

    if n <= 4:
        legend = {
            "orient": "vertical",
            "right": 8,
            "top": "middle",
            "type": "plain",
            "textStyle": {"color": "#94a3b8", "fontSize": 11},
        }
        center, radius = ["40%", "56%"], ["36%", "58%"]
    else:
        legend = {
            "orient": "horizontal",
            "left": "center",
            "bottom": 4,
            "type": "scroll",
            "pageIconColor": "#22d3ee",
            "pageTextStyle": {"color": "#94a3b8"},
            "textStyle": {"color": "#94a3b8", "fontSize": 10},
        }
        center, radius = ["50%", "48%"], ["30%", "52%"]

    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {"trigger": "item", "formatter": "{b}: {c} ({d}%)"},
        "legend": legend,
        "series": [
            {
                "name": title_key,
                "type": "pie",
                "radius": radius,
                "center": center,
                "avoidLabelOverlap": True,
                # 极小扇区至少 3°，避免细到看不见
                "minAngle": 3,
                "itemStyle": {
                    "borderRadius": 6,
                    "borderColor": "#0f172a",
                    "borderWidth": 2,
                    "shadowBlur": 18,
                    "shadowColor": "rgba(34,211,238,0.35)",
                },
                "label": {
                    "position": "inside",
                    "formatter": "{d}%",
                    "fontSize": 10,
                    "color": "#fff",
                    "textShadowColor": "rgba(0,0,0,0.6)",
                    "textShadowBlur": 4,
                },
                "labelLine": {"show": False},
                "data": pie_data,
            }
        ],
    }


def _build_scatter_option(chart: dict, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    points = chart.get("data") or []
    threshold = chart.get("warning_threshold", chart.get("threshold"))
    if threshold is None:
        threshold = 80

    # 模型常漏传 data：自动补一组可渲染的磨损散点，避免空白面板
    if not points:
        import random
        rng = random.Random(42)
        points = []
        for i in range(18):
            x = round(8 + i * 4.5 + rng.uniform(-1.5, 1.5), 1)
            y = round(18 + i * 3.8 + rng.uniform(-4, 6), 1)
            points.append([x, max(5.0, min(98.0, y))])

    x_name = chart.get("x_name") or "时长"
    y_name = chart.get("y_name") or "磨损度"
    x_en = chart.get("x_name_en") or "Duration"
    y_en = chart.get("y_name_en") or "Wear"
    x_key, y_key = f"{title_key}_X", f"{title_key}_Y"
    _reg(i18n_zh, i18n_en, x_key, x_name, None if x_en == x_name else x_en)
    _reg(i18n_zh, i18n_en, y_key, y_name, None if y_en == y_name else y_en)

    normal, warning = [], []
    for p in points:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            x, y = float(p[0]), float(p[1])
            if threshold is not None and y >= float(threshold):
                warning.append([x, y])
            else:
                normal.append([x, y])
        elif isinstance(p, dict):
            x, y = float(p.get("x", 0)), float(p.get("y", 0))
            if threshold is not None and y >= float(threshold):
                warning.append([x, y])
            else:
                normal.append([x, y])

    series = [
        {
            "name": f"{title_key}_OK",
            "type": "scatter",
            "data": normal,
            "symbolSize": 10,
            "itemStyle": {"color": "#22d3ee", "shadowBlur": 8, "shadowColor": "rgba(34,211,238,0.5)"},
        }
    ]
    _reg(i18n_zh, i18n_en, f"{title_key}_OK", chart.get("normal_name") or "正常", chart.get("normal_name_en"))

    if warning:
        series.append(
            {
                "name": f"{title_key}_WARN",
                "type": "scatter",
                "data": warning,
                "symbolSize": 14,
                "itemStyle": {"color": "#ef4444", "shadowBlur": 12, "shadowColor": "rgba(239,68,68,0.7)"},
            }
        )
        _reg(i18n_zh, i18n_en, f"{title_key}_WARN", chart.get("warning_name") or "高危预警", chart.get("warning_name_en"))

    mark_line = None
    if threshold is not None:
        mark_line = {
            "silent": True,
            "symbol": "none",
            "lineStyle": {"color": "#ef4444", "type": "dashed", "width": 2},
            "data": [{"yAxis": float(threshold)}],
            "label": {"formatter": "WARN", "position": "insideEndTop", "color": "#ef4444"},
        }
        series[0]["markLine"] = mark_line

    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {"trigger": "item"},
        "legend": {"top": 32, "textStyle": {"color": "#94a3b8", "fontSize": 11}},
        "grid": {"top": 64, "left": "12%", "right": "8%", "bottom": "14%", "containLabel": True},
        "xAxis": {
            "type": "value",
            "name": x_key,
            "axisLabel": {"color": "#94a3b8"},
            "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.12)"}},
        },
        "yAxis": {
            "type": "value",
            "name": y_key,
            "axisLabel": {"color": "#94a3b8"},
            "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.12)"}},
        },
        "series": series,
    }


def _build_bar3d_option(chart: dict, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    x_size = int(chart.get("x_size", 8))
    y_size = int(chart.get("y_size", 8))
    raw = chart.get("data")

    if raw is None:
        # Auto-simulate an 8x8 temperature terrain if caller omitted data
        import math
        raw = []
        for i in range(x_size):
            for j in range(y_size):
                val = 45 + 25 * math.sin(i / 2.2) * math.cos(j / 2.5) + (i + j) % 7
                raw.append([i, j, round(val, 1)])
    elif isinstance(raw, list) and raw and not isinstance(raw[0], (list, tuple)):
        # Flat matrix row-major
        flat = list(raw)
        raw = []
        for i in range(x_size):
            for j in range(y_size):
                idx = i * y_size + j
                if idx < len(flat):
                    raw.append([i, j, flat[idx]])

    x_cats = chart.get("x_categories") or [f"X{i}" for i in range(x_size)]
    y_cats = chart.get("y_categories") or [f"Y{j}" for j in range(y_size)]

    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {},
        "visualMap": {
            "max": max((p[2] for p in raw), default=100),
            "min": min((p[2] for p in raw), default=0),
            "inRange": {"color": ["#0ea5e9", "#22d3ee", "#fbbf24", "#ef4444"]},
            "textStyle": {"color": "#94a3b8"},
            "right": 8,
            "top": "middle",
        },
        "xAxis3D": {"type": "category", "data": x_cats},
        "yAxis3D": {"type": "category", "data": y_cats},
        "zAxis3D": {"type": "value"},
        "grid3D": {
            "boxWidth": 180,
            "boxDepth": 140,
            "viewControl": {
                "projection": "perspective",
                "autoRotate": True,
                "autoRotateSpeed": 12,
                "distance": 220,
            },
            "light": {"main": {"intensity": 1.2}, "ambient": {"intensity": 0.4}},
        },
        "series": [
            {
                "type": "bar3D",
                "data": raw,
                "shading": "lambert",
                "label": {"show": False},
                "itemStyle": {"opacity": 0.9},
                "emphasis": {"label": {"show": True}},
            }
        ],
    }


def _axis_name(axis: Any) -> str:
    if isinstance(axis, dict):
        return _coerce_text(axis.get("name") or axis.get("title") or "")
    if isinstance(axis, list) and axis:
        return _axis_name(axis[0])
    return ""


def _axis_data(axis: Any) -> list:
    if isinstance(axis, dict):
        data = axis.get("data")
        return list(data) if isinstance(data, list) else []
    if isinstance(axis, list) and axis and isinstance(axis[0], dict):
        return _axis_data(axis[0])
    return []


def _normalize_chart(chart: dict, idx: int) -> dict:
    """把模型常写的「半成品 ECharts option」纠正为 Panel Array 字段。

    典型错误：
    - title={'text': '产能...'} 而非字符串
    - 把 xAxis/yAxis/series/tooltip 直接塞进 panel，却声明 type=line/bar/raw
    - pie.data 传成纯数字列表
    - type=raw 却不包一层 option
    """
    c = dict(chart)

    # ---- title / title_en ----
    title = c.get("title")
    if isinstance(title, dict):
        text = _coerce_text(title)
        title_en = _coerce_text(title, _EN_DICT_KEYS)
        c["title"] = text or f"Panel {idx + 1}"
        if title_en and title_en != c["title"] and not c.get("title_en"):
            c["title_en"] = title_en
    elif not title:
        c["title"] = _coerce_text(c.get("name")) or f"Panel {idx + 1}"

    if c.get("title_en") is not None and not isinstance(c.get("title_en"), str):
        c["title_en"] = _coerce_text(c.get("title_en"), _EN_DICT_KEYS) or None

    ctype = (_coerce_text(c.get("type")) or "").lower().replace("-", "").replace("_", "")

    # ---- 从嵌套 ECharts 字段抽数据 ----
    series = c.get("series")
    x_axis = c.get("xAxis") or c.get("x_axis")
    y_axis = c.get("yAxis") or c.get("y_axis")

    if not c.get("x_data") and not c.get("categories"):
        xd = _axis_data(x_axis)
        if xd:
            c["x_data"] = xd

    if not c.get("x_name") and x_axis:
        xn = _axis_name(x_axis)
        if xn:
            c["x_name"] = xn

    if not c.get("y_name") and y_axis:
        yn = _axis_name(y_axis)
        if yn:
            c["y_name"] = yn

    # line/bar：从 series[0].data 抽 y_data；多 series 升为 combo
    if isinstance(series, list) and series:
        if ctype in ("", "line", "bar"):
            if len(series) >= 2 and any(
                isinstance(s, dict) and s.get("yAxisIndex") not in (None, 0) for s in series
            ):
                c["type"] = "combo"
                ctype = "combo"
            elif len(series) >= 2 and ctype in ("", "line", "bar"):
                # 多 series 同轴：也走 combo，更稳
                c["type"] = "combo"
                ctype = "combo"
            else:
                s0 = series[0] if isinstance(series[0], dict) else {}
                if not c.get("y_data") and not c.get("data"):
                    c["y_data"] = s0.get("data", []) if isinstance(s0, dict) else []
                if not c.get("y_name") and isinstance(s0, dict) and s0.get("name"):
                    c["y_name"] = s0.get("name")
                if not ctype:
                    c["type"] = (s0.get("type") if isinstance(s0, dict) else None) or "line"
                    ctype = (_coerce_text(c["type"]) or "line").lower()

        if ctype == "pie":
            # series[0].data 可能才是真正的饼图数据
            s0 = series[0] if isinstance(series[0], dict) else {}
            if isinstance(s0, dict) and s0.get("data") is not None:
                c["data"] = s0["data"]

        if ctype == "combo" and not c.get("series"):
            c["series"] = series

    # pie：纯数字 / 过长列表 → 交给 _build_pie_option 统一折叠，这里只做轻量规整
    if ctype == "pie":
        raw = c.get("data")
        if isinstance(raw, list) and raw and all(isinstance(v, (int, float)) for v in raw):
            # 不再生成 Item1..ItemN；保留数值，命名与折叠在 _build_pie_option
            c["data"] = [{"name": "", "value": float(v)} for v in raw]
        elif isinstance(raw, list) and raw and all(isinstance(v, str) for v in raw):
            c["data"] = [{"name": v, "value": 1} for v in raw]

    # raw / 误把完整 option 摊开：把 ECharts 字段收进 option
    echarts_keys = {
        "series", "xAxis", "yAxis", "grid", "tooltip", "legend", "visualMap",
        "grid3D", "xAxis3D", "yAxis3D", "zAxis3D", "radar", "dataset",
        "dataZoom", "toolbox", "graphic", "color", "backgroundColor",
    }
    has_echarts_bits = any(k in c for k in echarts_keys)
    if ctype in ("raw", "option", "echarts") or (
        has_echarts_bits and ctype not in ("combo", "pie", "scatter", "bar3d", "bar3D", "surface", "temp3d", "heatmap", "line", "bar")
    ):
        option = c.get("option")
        if not isinstance(option, dict):
            option = {k: c[k] for k in echarts_keys if k in c}
            # title 若是字符串已抽走；若原 title 是 dict 里还有 textStyle 等，可忽略
            if option:
                c["option"] = option
                c["type"] = "raw"
                ctype = "raw"

    if not ctype:
        c["type"] = "line"

    return c


def _build_heatmap_option(chart: dict, title_key: str, i18n_zh: dict, i18n_en: dict) -> dict:
    """二维热力图：支持 [[i,j,v],...] 或二维矩阵；缺数据时自动模拟。"""
    import math

    raw = chart.get("data")
    x_cats = chart.get("x_categories") or chart.get("x_data")
    y_cats = chart.get("y_categories") or chart.get("y_data")

    # 从嵌套 ECharts 字段抽
    if raw is None and isinstance(chart.get("series"), list) and chart["series"]:
        s0 = chart["series"][0] if isinstance(chart["series"][0], dict) else {}
        raw = s0.get("data")
    if not x_cats:
        x_cats = _axis_data(chart.get("xAxis") or chart.get("x_axis")) or None
    if not y_cats:
        y_cats = _axis_data(chart.get("yAxis") or chart.get("y_axis")) or None

    points: list = []
    if raw is None:
        xn, yn = 8, 6
        x_cats = x_cats or [f"X{i}" for i in range(xn)]
        y_cats = y_cats or [f"Y{j}" for j in range(yn)]
        for i in range(xn):
            for j in range(yn):
                points.append([i, j, round(35 + 15 * math.sin(i / 2) * math.cos(j / 2.5), 1)])
    elif isinstance(raw, list) and raw and isinstance(raw[0], (list, tuple)) and len(raw[0]) >= 3:
        points = [[int(p[0]), int(p[1]), float(p[2])] for p in raw]
        max_i = max(p[0] for p in points) + 1
        max_j = max(p[1] for p in points) + 1
        x_cats = x_cats or [f"X{i}" for i in range(max_i)]
        y_cats = y_cats or [f"Y{j}" for j in range(max_j)]
    elif isinstance(raw, list) and raw and isinstance(raw[0], (list, tuple)):
        # 二维矩阵
        yn = len(raw)
        xn = max(len(r) for r in raw if isinstance(r, (list, tuple))) if raw else 0
        x_cats = x_cats or [f"X{i}" for i in range(xn)]
        y_cats = y_cats or [f"Y{j}" for j in range(yn)]
        for j, row in enumerate(raw):
            if not isinstance(row, (list, tuple)):
                continue
            for i, v in enumerate(row):
                try:
                    points.append([i, j, float(v)])
                except (TypeError, ValueError):
                    points.append([i, j, 0.0])
    else:
        x_cats = x_cats or ["X0"]
        y_cats = y_cats or ["Y0"]
        points = [[0, 0, 0]]

    vals = [p[2] for p in points] or [0]
    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {"position": "top"},
        "grid": {"top": 48, "left": "12%", "right": "14%", "bottom": "12%", "containLabel": True},
        "xAxis": {
            "type": "category",
            "data": x_cats,
            "splitArea": {"show": True},
            "axisLabel": {"color": "#94a3b8", "fontSize": 10},
        },
        "yAxis": {
            "type": "category",
            "data": y_cats,
            "splitArea": {"show": True},
            "axisLabel": {"color": "#94a3b8", "fontSize": 10},
        },
        "visualMap": {
            "min": min(vals),
            "max": max(vals),
            "calculable": True,
            "orient": "vertical",
            "right": 4,
            "top": "middle",
            "inRange": {"color": ["#0ea5e9", "#22d3ee", "#fbbf24", "#ef4444"]},
            "textStyle": {"color": "#94a3b8"},
        },
        "series": [
            {
                "name": title_key,
                "type": "heatmap",
                "data": points,
                "label": {"show": False},
                "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.5)"}},
            }
        ],
    }


def _build_line_or_bar_option(chart: dict, title_key: str, ctype: str, i18n_zh: dict, i18n_en: dict) -> dict:
    x_data = chart.get("x_data") or chart.get("categories") or []
    y_data = chart.get("y_data") or chart.get("data") or []
    # 模型常漏 x_data：用序号兜底，避免空轴
    if not x_data and isinstance(y_data, list) and y_data:
        x_data = [str(i + 1) for i in range(len(y_data))]
    y_name = chart.get("y_name") or chart.get("name") or ctype
    y_en = chart.get("y_name_en") or chart.get("name_en")
    y_key = f"{title_key}_Y"
    _reg(i18n_zh, i18n_en, y_key, y_name, y_en)
    return {
        "backgroundColor": "transparent",
        "title": {
            "text": title_key,
            "left": "center",
            "top": 8,
            "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        },
        "tooltip": {"trigger": "axis"},
        "grid": {"top": 56, "left": "10%", "right": "8%", "bottom": "12%", "containLabel": True},
        "xAxis": {"type": "category", "data": x_data, "axisLabel": {"color": "#94a3b8"}},
        "yAxis": {
            "type": "value",
            "name": y_key,
            "axisLabel": {"color": "#94a3b8"},
            "splitLine": {"lineStyle": {"color": "rgba(148,163,184,0.12)"}},
        },
        "series": [
            {
                "name": y_key,
                "type": ctype,
                "data": y_data,
                "smooth": ctype == "line",
                "itemStyle": {"color": "#22d3ee"},
            }
        ],
    }


def _build_panel_option(chart: dict, idx: int, i18n_zh: dict, i18n_en: dict) -> dict:
    chart = _normalize_chart(chart, idx)
    ctype = (_coerce_text(chart.get("type")) or "line").lower().replace("-", "").replace("_", "")
    title = chart.get("title") or chart.get("name") or f"Panel {idx + 1}"
    title_en = chart.get("title_en") or chart.get("name_en")
    title_key = f"T_P{idx}"
    _reg(i18n_zh, i18n_en, title_key, title, title_en)

    if ctype in ("raw", "option", "echarts"):
        option = chart.get("option")
        if not isinstance(option, dict) or not option:
            # 最后兜底：空 option 时生成一个占位折线，避免整屏失败
            option = _build_line_or_bar_option(
                {"x_data": ["1", "2", "3"], "y_data": [0, 0, 0], "y_name": title},
                title_key,
                "line",
                i18n_zh,
                i18n_en,
            )
        else:
            # 把 panel 标题写回 option，避免空白标题
            t = option.get("title")
            if not t:
                option["title"] = {
                    "text": title_key,
                    "left": "center",
                    "top": 8,
                    "textStyle": {"color": "#e2e8f0", "fontSize": 13},
                }
            elif isinstance(t, dict) and not t.get("text"):
                t["text"] = title_key
        validate_echarts(option)
        return option

    if ctype in ("combo", "dual", "dualy", "mixed", "linebar"):
        option = _build_combo_option(chart, title_key, i18n_zh, i18n_en)
    elif ctype == "pie":
        option = _build_pie_option(chart, title_key, i18n_zh, i18n_en)
    elif ctype == "scatter":
        option = _build_scatter_option(chart, title_key, i18n_zh, i18n_en)
    elif ctype in ("bar3d", "bar3D", "surface", "temp3d"):
        option = _build_bar3d_option(chart, title_key, i18n_zh, i18n_en)
    elif ctype == "heatmap":
        option = _build_heatmap_option(chart, title_key, i18n_zh, i18n_en)
    elif ctype in ("line", "bar"):
        option = _build_line_or_bar_option(chart, title_key, ctype, i18n_zh, i18n_en)
    else:
        raise ValueError(
            f"panels[{idx}] 不支持的 type='{chart.get('type')}'。"
            "可用: combo, pie, scatter, bar3d, heatmap, line, bar, raw"
        )

    validate_echarts(option)
    return option


def _grid_cols(n: int) -> int:
    """面板数 → 列数：1 独占；2~4 两列；5~9 三列；10+ 四列。行数自然增长，聊天区可滚动。"""
    if n <= 1:
        return 1
    if n <= 4:
        return 2
    if n <= 9:
        return 3
    return 4


def export_dashboard(
    title: str,
    charts: list,
    filename: str = "chart_option.json",
    title_en: Optional[str] = None,
    layout: str = "auto",
    model3d_keyword: Optional[str] = None,
    template: Optional[str] = None,
):
    """Export a multi-panel dashboard as Panel Array protocol.

    Each chart becomes an independent ECharts option (no shared multi-grid).
    面板数量不设上限：布局按数量自适应列数（1/2/3/4 列），行数向下生长，
    每行固定高度，前端聊天区滚动查看，不裁切不挤压。

    charts item schema (pick one type):
      combo:    {type, title, title_en, x_data, series:[{name,name_en,type,yAxisIndex,data,color?}]}
      pie:      {type, title, title_en, data:[{name,name_en,value}]}
      scatter:  {type, title, title_en, data:[[x,y],...], warning_threshold, x_name, y_name}
      bar3d:    {type, title, title_en, data:[[i,j,v],...]?, x_size=8, y_size=8}
      line/bar: {type, title, title_en, x_data, y_data}
      raw:      {type:'raw', title, title_en, option:{...full echarts option...}}
    """
    if not title:
        raise ValueError("export_dashboard 必须提供大屏 title")
    if not charts or not isinstance(charts, list):
        raise ValueError("export_dashboard 必须提供非空 charts 列表")

    i18n_zh: Dict[str, Any] = {}
    i18n_en: Dict[str, Any] = {}
    _reg(i18n_zh, i18n_en, "T_DASH_TITLE", title, title_en)

    panels = []
    for idx, chart in enumerate(charts):
        if not isinstance(chart, dict):
            raise ValueError(f"charts[{idx}] 必须是字典")
        panel_id = chart.get("id") or f"p{idx}"
        title_key = f"T_P{idx}"
        option = _build_panel_option(chart, idx, i18n_zh, i18n_en)
        panels.append({"id": panel_id, "title": title_key, "option": option})

    n = len(panels)
    cols = _grid_cols(n)
    import math as _math
    rows = max(1, _math.ceil(n / cols))
    if layout in ("auto", "", None):
        layout = f"{cols}x{rows}"

    payload = {
        "type": "dashboard",
        "title": "T_DASH_TITLE",
        "layout": layout,
        "template": template or "gen_deep_beta",
        "i18n": {"zh-CN": i18n_zh, "en": i18n_en},
        "panels": panels,
    }

    if model3d_keyword:
        import sqlite3
        import os
        db_path = os.path.join(os.path.dirname(__file__), '..', 'config.db')
        try:
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                like_query = f"%{model3d_keyword}%"
                cursor.execute("SELECT file_path FROM agent_3d_models WHERE keyword LIKE ? OR name LIKE ? ORDER BY created_at DESC", (like_query, like_query))
                row = cursor.fetchone()
                if row:
                    payload["model3d_url"] = row['file_path']
        except Exception as e:
            pass
            
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return payload

def export_dashboard_v2(
    title: str,
    charts: list,
    template_id: str,
    filename: str = "chart_option.json",
    title_en: Optional[str] = None,
    model3d_keyword: Optional[str] = None,
):
    """
    Export a multi-panel dashboard specifically bound to a predefined React template.
    This shifts the visual responsibility to the frontend HTML/CSS/Canvas layer.
    
    Args:
        title: Dashboard Title
        charts: List of chart data dicts. Much simpler than v1.
        template_id: The ID of the template in the database.
            NEW HIGH-END TEMPLATES (Choose based on context):
            - Cyberpunk: 'gen_cyberpunk_alpha' (2x2), 'gen_cyberpunk_beta' (center 3D)
            - Deep Ocean: 'gen_deep_alpha' (2x2), 'gen_deep_beta' (center 3D)
            - Industrial: 'gen_industrial_alpha' (2x2), 'gen_industrial_beta' (center 3D)
            - Holographic: 'gen_holographic_alpha' (2x2), 'gen_holographic_beta' (center 3D)
            - Glassmorphism: 'gen_glassmorphism_alpha' (2x2), 'gen_glassmorphism_beta' (center 3D)
        filename: Output JSON filename
        title_en: English title
        model3d_keyword: (Optional) Automatically inject a 3D model into the dashboard based on this keyword
    """
    if not template_id:
        raise ValueError("export_dashboard_v2 必须提供 template_id")
        
    # Reuse the same payload generator but inject template_id
    payload = export_dashboard(title=title, charts=charts, filename=filename, title_en=title_en, model3d_keyword=model3d_keyword)
    payload["template"] = template_id
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    return payload

