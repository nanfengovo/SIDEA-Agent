"""目标拆分流水线（Goal Mode）。

能力档位（由 Active LLM Profile 决定）：
  - template：小模型友好。布局枚举 + 模拟数据 + SDK 模板拼装。
  - freeform：商业/强模型。直接生成完整 ECharts dashboard JSON（含自定义视觉）。

模板档配方：
  1. plan_layout → 2. simulate_data → 3. export → 4. narrate

自由档配方：
  1. insight（可选 RCS）→ 2. freeform_design（完整 option）→ 3. export → 4. narrate（带数据洞察）
"""
from __future__ import annotations

import json
import math
import random
import re
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("agent.goal_pipeline")

_DASHBOARD_HINTS = re.compile(
    r"(大屏|仪表盘|dashboard|数字孪生|监控面板|四宫格|多面板|多图表|"
    r"可视化大屏|监控大屏|看板|twin)",
    re.I,
)

_THEME_RCS = re.compile(r"(RCS|AMR|AGV|机器人|调度|车队)", re.I)
_THEME_WORKSHOP = re.compile(r"(车间|产线|制造|压铸|能耗|刀具|孪生)", re.I)


def looks_like_dashboard(message: str) -> bool:
    return bool(_DASHBOARD_HINTS.search(message or ""))


def should_run_goal_dashboard(message: str, execution_mode: str = "auto") -> bool:
    mode = (execution_mode or "auto").lower()
    if mode == "react":
        return False
    if mode == "goal":
        # 强制目标模式：大屏走配方；非大屏暂用大屏配方仅当含可视化意图，否则返回 False 回退 ReAct
        return looks_like_dashboard(message)
    # auto：仅对大屏类任务启用
    return looks_like_dashboard(message)


def _evt(etype: str, name: str, message: str, **extra) -> dict:
    data = {"name": name, "message": message, **extra}
    return {"id": uuid.uuid4().hex, "type": etype, "data": data, "timestamp": int(time.time() * 1000)}


def _token(text: str) -> dict:
    return {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": text}}


def _default_layout_for(message: str) -> Dict[str, Any]:
    if _THEME_RCS.search(message or ""):
        return {
            "title": "RCS AMR 任务执行监控大屏",
            "title_en": "RCS AMR Task Execution Dashboard",
            "panels": [
                {"id": "map", "type": "scatter", "title": "AMR 实时位置仿真", "title_en": "AMR Live Positions",
                 "x_name": "X (m)", "y_name": "Y (m)"},
                {"id": "eff", "type": "combo", "title": "任务效率与自动化率", "title_en": "Efficiency & Automation"},
                {"id": "status", "type": "pie", "title": "机器人状态分布", "title_en": "Robot Status"},
                {"id": "load", "type": "bar3d", "title": "库区负载三维阵列", "title_en": "Zone Load 3D",
                 "x_size": 8, "y_size": 8},
            ],
        }
    if _THEME_WORKSHOP.search(message or ""):
        return {
            "title": "车间实时数字孪生监控大屏",
            "title_en": "Workshop Digital Twin Dashboard",
            "panels": [
                {"id": "cap", "type": "combo", "title": "产能与缺陷追踪", "title_en": "Capacity & Defects"},
                {"id": "energy", "type": "pie", "title": "工艺能耗分布", "title_en": "Process Energy"},
                {"id": "tool", "type": "scatter", "title": "刀具磨损寿命预测", "title_en": "Tool Wear Prediction",
                 "x_name": "时长(h)", "y_name": "磨损度", "warning_threshold": 0.8},
                {"id": "temp", "type": "bar3d", "title": "核心三轴温度阵列", "title_en": "Temperature Array 3D",
                 "x_size": 8, "y_size": 8},
            ],
        }
    return {
        "title": "工业数据可视化监控大屏",
        "title_en": "Industrial Monitoring Dashboard",
        "panels": [
            {"id": "trend", "type": "combo", "title": "关键指标趋势", "title_en": "KPI Trends"},
            {"id": "share", "type": "pie", "title": "结构占比", "title_en": "Composition"},
            {"id": "scatter", "type": "scatter", "title": "散点相关分析", "title_en": "Correlation"},
            {"id": "heat", "type": "heatmap", "title": "热力分布", "title_en": "Heatmap"},
        ],
    }


_LAYOUT_PROMPT = """你是大屏布局规划器。根据用户需求和参考图分析，只输出一个 JSON 对象，不要 markdown，不要解释。

JSON schema:
{{
  "title": "中文标题",
  "title_en": "English title",
  "composition": "map_centric|grid",
  "panels": [
    {{"id":"p0","type":"combo|pie|scatter|bar3d|line|bar|heatmap","title":"中文","title_en":"EN"}}
  ]
}}

规则：
- panels 数量 3~6
- type 只能是上述枚举
- 若有参考图：必须模仿参考图的信息架构（例如「中央大地图 + 底部 KPI 环图/仪表 + 设备状态」），不要改成普通均分四宫格
- 地图/场地区域用 scatter 或 heatmap；产量进度用 pie；节拍/完成率用 combo 或 pie；设备状态用 bar
- 不要写 data / series / option / 代码

用户需求：
{message}

参考图布局分析：
{reference_analysis}
"""


def _resolve_image_paths(attachments: Optional[List[str]]) -> List[Path]:
    paths: List[Path] = []
    for url in attachments or []:
        name = str(url).split("/")[-1].split("?")[0]
        if not name:
            continue
        p = Path("uploads") / name
        if p.exists() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            paths.append(p)
    return paths


def _map_centric_layout_for(message: str) -> Dict[str, Any]:
    """模仿「中央厂区地图 + 底部产量/节拍/设备状态」类参考大屏。"""
    if _THEME_RCS.search(message or ""):
        title, title_en = "AMR 任务管理与执行大屏", "AMR Task Management Dashboard"
    elif "制证" in (message or ""):
        title, title_en = "机器人制证系统监控大屏", "Robot Credential Issuing Dashboard"
    else:
        title, title_en = "工业机器人现场监控大屏", "Industrial Robot Site Dashboard"
    return {
        "title": title,
        "title_en": title_en,
        "composition": "map_centric",
        "panels": [
            {
                "id": "floor",
                "type": "amr_map",
                "title": "机器人实时位置与厂区仿真",
                "title_en": "Robot Live Floor Map",
            },
            {
                "id": "prod",
                "type": "pie",
                "title": "当日生产进度",
                "title_en": "Today Production Progress",
            },
            {
                "id": "takt",
                "type": "combo",
                "title": "生产节拍与合格率",
                "title_en": "Takt & Yield",
            },
            {
                "id": "equip",
                "type": "bar",
                "title": "设备详细状态",
                "title_en": "Equipment Status",
            },
            {
                "id": "zone",
                "type": "heatmap",
                "title": "分区任务热力",
                "title_en": "Zone Task Heatmap",
            },
        ],
    }


def _build_amr_floor_option(rng: random.Random, message: str = "") -> Dict[str, Any]:
    """构建「厂区/机器人实时位置」地图面板的完整 ECharts option（作为 raw 面板）。

    包含：分区色块 + 设备图标 + 按状态着色的机器人（含电量/编号）+ 动画运输路径。
    这是普通散点图做不到的——它才真正像参考图里的中央厂区地图。
    """
    W, H = 100.0, 60.0

    # 分区色块（markArea）：制证 / 辊道 / AGV 充电 / 成品缓存
    zones = [
        {"name": "制证区 A", "rect": [(2, 2), (30, 58)], "color": "rgba(34,211,238,0.08)", "border": "#22d3ee"},
        {"name": "辊道区 B", "rect": [(34, 2), (62, 58)], "color": "rgba(59,130,246,0.08)", "border": "#3b82f6"},
        {"name": "AGV 充电 C", "rect": [(66, 32), (98, 58)], "color": "rgba(16,185,129,0.08)", "border": "#10b981"},
        {"name": "成品缓存 D", "rect": [(66, 2), (98, 30)], "color": "rgba(168,85,247,0.08)", "border": "#a855f7"},
    ]
    mark_area_data = [
        [
            {"name": z["name"], "xAxis": z["rect"][0][0], "yAxis": z["rect"][0][1],
             "itemStyle": {"color": z["color"], "borderColor": z["border"], "borderWidth": 1},
             "label": {"show": True, "position": "insideTopLeft", "color": z["border"], "fontSize": 11}},
            {"xAxis": z["rect"][1][0], "yAxis": z["rect"][1][1]},
        ]
        for z in zones
    ]

    # 设备（固定工位）
    equipment = [
        {"value": [8, 46], "name": "制证机-1"}, {"value": [8, 20], "name": "制证机-2"},
        {"value": [22, 46], "name": "制证机-3"}, {"value": [48, 44], "name": "辊道-A"},
        {"value": [48, 16], "name": "辊道-B"}, {"value": [82, 20], "name": "缓存架-1"},
    ]

    # 机器人：状态分组（正常/暂停/故障），带编号+电量
    def _robot(x, y, mid, batt):
        return {"value": [round(x, 1), round(y, 1)], "name": f"{mid} {batt}%"}

    normal, paused, fault = [], [], []
    for i in range(9):
        x = rng.uniform(4, 96)
        y = rng.uniform(4, 56)
        mid = f"M{35 + i}"
        batt = rng.randint(35, 99)
        r = _robot(x, y, mid, batt)
        if i == 3:
            fault.append(_robot(x, y, mid, rng.randint(5, 20)))
        elif i in (1, 6):
            paused.append(r)
        else:
            normal.append(r)

    # 运输路径（带流动动画）
    routes = [
        [[8, 46], [30, 40], [48, 44], [82, 24]],
        [[8, 20], [34, 24], [62, 20], [82, 16]],
        [[22, 46], [40, 50], [66, 44]],
    ]
    lines_data = [{"coords": rc} for rc in routes]

    axis_hidden = {
        "type": "value", "min": 0, "max": None, "show": False,
        "axisLine": {"show": False}, "axisTick": {"show": False},
        "axisLabel": {"show": False}, "splitLine": {"show": False},
    }
    x_axis = {**axis_hidden, "max": W}
    y_axis = {**axis_hidden, "max": H}

    return {
        "backgroundColor": "transparent",
        "grid": {"left": 12, "right": 12, "top": 44, "bottom": 12, "borderColor": "#22d3ee", "borderWidth": 1, "show": True},
        "tooltip": {"trigger": "item"},
        "legend": {
            "top": 10, "right": 12,
            "data": ["正常", "暂停", "故障"],
            "textStyle": {"color": "#94a3b8", "fontSize": 11},
        },
        "xAxis": x_axis,
        "yAxis": y_axis,
        "series": [
            {
                "name": "分区", "type": "scatter", "data": [], "silent": True,
                "markArea": {"silent": True, "data": mark_area_data},
            },
            {
                "name": "运输路径", "type": "lines", "coordinateSystem": "cartesian2d",
                "data": lines_data, "polyline": True, "silent": True,
                "lineStyle": {"color": "#22d3ee", "width": 1, "opacity": 0.35, "curveness": 0.1},
                "effect": {"show": True, "period": 5, "trailLength": 0.4, "symbol": "arrow", "symbolSize": 6, "color": "#67e8f9"},
                "z": 2,
            },
            {
                "name": "设备", "type": "scatter", "symbol": "rect", "symbolSize": 14,
                "data": equipment, "z": 3,
                "itemStyle": {"color": "rgba(59,130,246,0.85)", "borderColor": "#93c5fd", "borderWidth": 1},
                "label": {"show": True, "position": "bottom", "color": "#93c5fd", "fontSize": 9, "formatter": "{b}"},
            },
            {
                "name": "正常", "type": "effectScatter", "symbolSize": 12, "data": normal, "z": 5,
                "rippleEffect": {"scale": 2.4, "brushType": "stroke"},
                "itemStyle": {"color": "#10b981", "shadowBlur": 8, "shadowColor": "#10b981"},
                "label": {"show": True, "position": "top", "color": "#d1fae5", "fontSize": 9, "formatter": "{b}"},
            },
            {
                "name": "暂停", "type": "effectScatter", "symbolSize": 12, "data": paused, "z": 5,
                "rippleEffect": {"scale": 2.6, "brushType": "stroke"},
                "itemStyle": {"color": "#f59e0b", "shadowBlur": 8, "shadowColor": "#f59e0b"},
                "label": {"show": True, "position": "top", "color": "#fef3c7", "fontSize": 9, "formatter": "{b}"},
            },
            {
                "name": "故障", "type": "effectScatter", "symbolSize": 14, "data": fault, "z": 6,
                "rippleEffect": {"scale": 3.2, "brushType": "stroke"},
                "itemStyle": {"color": "#ef4444", "shadowBlur": 12, "shadowColor": "#ef4444"},
                "label": {"show": True, "position": "top", "color": "#fee2e2", "fontSize": 10, "fontWeight": "bold", "formatter": "{b}"},
            },
        ],
    }


def _looks_map_centric(text: str) -> bool:
    t = (text or "").lower()
    keys = (
        "地图", "厂区", "实时位置", "agv", "仿真", "中央", "底部", "节拍",
        "制证", "floor", "map", "legend", "gauge", "donut", "环图", "仪表",
    )
    return sum(1 for k in keys if k in t) >= 2


async def _analyze_reference_images(
    llm,
    image_paths: List[Path],
    message: str,
) -> Tuple[str, str]:
    """返回 (分析文本, 来源: vision|heuristic|none)。"""
    if not image_paths:
        return "", "none"

    # 1) 尝试视觉模型读图
    if llm is not None:
        try:
            import base64
            from langchain_core.messages import HumanMessage, SystemMessage

            parts: List[Any] = [{
                "type": "text",
                "text": (
                    "用户上传了大屏参考图。请用中文列出其布局骨架（不要复述像素细节）：\n"
                    "1) 整体构图（如中央大地图+底部KPI）\n"
                    "2) 各区域分别展示什么指标\n"
                    "3) 建议我们用哪些面板类型复现（scatter/pie/combo/bar/heatmap）\n"
                    "4) 推荐中文大屏标题\n"
                    "控制在 12 行以内。"
                ),
            }]
            for p in image_paths[:2]:
                raw = p.read_bytes()
                b64 = base64.b64encode(raw).decode("ascii")
                mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                })
            resp = await llm.ainvoke([
                SystemMessage(content="你是工业大屏UI分析师。只描述布局与信息架构，便于后续复现。"),
                HumanMessage(content=parts),
            ])
            content = (getattr(resp, "content", "") or "").strip()
            if content and len(content) > 40:
                return content, "vision"
        except Exception as e:
            logger.warning(f"reference vision analyze failed: {e}")

    # 2) 无视觉能力时的启发式：有参考图 + 业务词 → 地图中心构图
    names = ", ".join(p.name for p in image_paths)
    heuristic = (
        f"用户上传了参考大屏图片（{names}）。\n"
        "典型构图推断：顶部标题栏；中央大面积厂区/机器人实时位置图（含状态图例）；"
        "底部为产量进度环图、生产节拍仪表、设备/AGV详细状态入口。\n"
        "复现建议：scatter 厂区地图 + pie 当日进度 + combo 节拍/合格 + bar 设备状态 + heatmap 分区热力。\n"
        f"用户文字需求：{message[:180]}"
    )
    return heuristic, "heuristic"


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                return obj
        except Exception:
            return None
    return None


def _normalize_layout(
    raw: Optional[dict],
    message: str,
    reference_analysis: str = "",
) -> Dict[str, Any]:
    prefer_map = _looks_map_centric(reference_analysis) or bool(reference_analysis)
    fallback = _map_centric_layout_for(message) if prefer_map else _default_layout_for(message)
    if not raw or not isinstance(raw, dict):
        return fallback
    title = str(raw.get("title") or fallback["title"]).strip() or fallback["title"]
    title_en = str(raw.get("title_en") or fallback["title_en"]).strip() or fallback["title_en"]
    panels_in = raw.get("panels")
    if not isinstance(panels_in, list) or not panels_in:
        return {**fallback, "title": title, "title_en": title_en}

    allowed = {"combo", "pie", "scatter", "bar3d", "line", "bar", "heatmap", "amr_map"}
    panels: List[dict] = []
    for i, p in enumerate(panels_in[:8]):
        if not isinstance(p, dict):
            continue
        t = str(p.get("type") or "line").lower().strip()
        if t not in allowed:
            t = "line"
        # 地图中心构图下，含「地图/位置/厂区」语义的散点升级为真正的 AMR 厂区地图
        if prefer_map and t == "scatter":
            title_txt = f"{p.get('title','')}{p.get('id','')}".lower()
            if any(k in title_txt for k in ("地图", "位置", "厂区", "floor", "map", "仿真")):
                t = "amr_map"
        panels.append({
            "id": str(p.get("id") or f"p{i}"),
            "type": t,
            "title": str(p.get("title") or f"面板{i+1}"),
            "title_en": str(p.get("title_en") or f"Panel {i+1}"),
            "x_name": p.get("x_name"),
            "y_name": p.get("y_name"),
            "warning_threshold": p.get("warning_threshold"),
            "x_size": int(p.get("x_size") or 8),
            "y_size": int(p.get("y_size") or 8),
        })
    if not panels:
        return fallback
    composition = str(raw.get("composition") or ("map_centric" if prefer_map else "grid"))
    return {"title": title, "title_en": title_en, "composition": composition, "panels": panels}


def _hours(n: int = 7) -> List[str]:
    return [f"{8 + i:02d}:00" for i in range(n)]


def _days(n: int = 7) -> List[str]:
    return [f"D{i+1}" for i in range(n)]


def simulate_panel(spec: dict, theme: str = "generic") -> dict:
    t = spec.get("type", "line")
    out: Dict[str, Any] = {
        "type": t,
        "title": spec.get("title"),
        "title_en": spec.get("title_en"),
        "id": spec.get("id"),
    }
    # Stable across processes (avoid PYTHONHASHSEED randomization of built-in hash)
    import hashlib

    seed_key = f"{spec.get('id')}|{spec.get('title')}|{t}|{theme}"
    seed = int(hashlib.md5(seed_key.encode("utf-8")).hexdigest()[:8], 16)
    rng = random.Random(seed)

    if t == "amr_map":
        # 输出为 raw 面板：完整自定义 ECharts option（不留 title，交给 SDK 注入双语标题）
        return {
            "type": "raw",
            "title": spec.get("title"),
            "title_en": spec.get("title_en"),
            "id": spec.get("id"),
            "option": _build_amr_floor_option(rng, spec.get("title") or ""),
        }

    if t == "combo":
        xs = _hours(6) if theme == "rcs" else _days(7)
        out["x_data"] = xs
        if theme == "rcs":
            out["series"] = [
                {"name": "任务完成数", "name_en": "Tasks Done", "type": "bar",
                 "data": [rng.randint(35, 75) for _ in xs]},
                {"name": "自动化率", "name_en": "Automation %", "type": "line", "yAxisIndex": 1,
                 "data": [round(70 + i * 2.2 + rng.uniform(-1, 1), 1) for i in range(len(xs))]},
                {"name": "稼动率", "name_en": "OEE %", "type": "line", "yAxisIndex": 1,
                 "data": [round(62 + i * 1.5 + rng.uniform(-2, 2), 1) for i in range(len(xs))]},
            ]
        else:
            out["series"] = [
                {"name": "产能", "name_en": "Output", "type": "bar",
                 "data": [rng.randint(800, 1400) for _ in xs]},
                {"name": "次品率", "name_en": "Defect %", "type": "line", "yAxisIndex": 1,
                 "data": [round(rng.uniform(0.8, 3.5), 2) for _ in xs]},
            ]
    elif t == "pie":
        if theme == "rcs":
            out["data"] = [
                {"name": "空闲", "name_en": "Idle", "value": rng.randint(8, 16)},
                {"name": "执行中", "name_en": "Busy", "value": rng.randint(20, 36)},
                {"name": "充电", "name_en": "Charging", "value": rng.randint(4, 10)},
                {"name": "故障", "name_en": "Fault", "value": rng.randint(1, 4)},
            ]
        else:
            out["data"] = [
                {"name": "冲压", "name_en": "Stamping", "value": 28},
                {"name": "焊接", "name_en": "Welding", "value": 32},
                {"name": "喷涂", "name_en": "Painting", "value": 18},
                {"name": "总装", "name_en": "Assembly", "value": 22},
            ]
    elif t == "scatter":
        n = 36
        pts = [[round(rng.uniform(0, 80), 1), round(rng.uniform(0, 1.2), 3)] for _ in range(n)]
        out["data"] = pts
        out["x_name"] = spec.get("x_name") or ("X" if theme == "rcs" else "时长(h)")
        out["y_name"] = spec.get("y_name") or ("Y" if theme == "rcs" else "磨损度")
        if theme != "rcs":
            out["warning_threshold"] = float(spec.get("warning_threshold") or 0.8)
    elif t == "bar3d":
        xs = int(spec.get("x_size") or 8)
        ys = int(spec.get("y_size") or 8)
        out["x_size"] = xs
        out["y_size"] = ys
        out["data"] = [
            [i, j, round(40 + 40 * math.sin(i / 2) * math.cos(j / 2) + rng.uniform(-5, 5), 1)]
            for i in range(xs) for j in range(ys)
        ]
    elif t == "heatmap":
        rows, cols = 7, 12
        out["x_data"] = [f"{h:02d}" for h in range(cols)]
        out["y_data"] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        out["data"] = [[c, r, rng.randint(10, 95)] for r in range(rows) for c in range(cols)]
    elif t == "bar":
        xs = _days(6)
        out["x_data"] = xs
        out["y_data"] = [rng.randint(40, 100) for _ in xs]
    else:
        xs = _hours(8)
        out["x_data"] = xs
        out["y_data"] = [round(50 + 10 * math.sin(i / 2) + rng.uniform(-3, 3), 1) for i in range(len(xs))]

    return out


def simulate_all(layout: Dict[str, Any], message: str) -> List[dict]:
    theme = "rcs" if _THEME_RCS.search(message or "") else (
        "workshop" if _THEME_WORKSHOP.search(message or "") else "generic"
    )
    # 地图中心构图：产量饼图改成「完成/剩余」进度语义
    charts = [simulate_panel(p, theme=theme) for p in layout["panels"]]
    if layout.get("composition") == "map_centric":
        for c in charts:
            title = str(c.get("title") or "")
            if c.get("type") == "pie" and ("进度" in title or "生产" in title):
                done = 560
                target = 1000
                c["data"] = [
                    {"name": "已完成", "name_en": "Done", "value": done},
                    {"name": "剩余目标", "name_en": "Remaining", "value": max(0, target - done)},
                ]
            if c.get("type") == "bar" and "设备" in title:
                c["x_data"] = ["制证设备", "辊道设备", "AGV", "当日生产"]
                c["y_data"] = [92, 88, 76, 95]
                c["title_en"] = c.get("title_en") or "Equipment Status"
    return charts


async def enrich_charts_with_live_rcs(
    charts: List[dict],
    message: str,
) -> Tuple[List[dict], str, Dict[str, Any]]:
    """优先通过可配置 RCS 适配层拉真数；失败则保留模拟数据。

    返回 (charts, source: live|simulated|mixed, meta)
    """
    meta: Dict[str, Any] = {"attempts": [], "live_caps": []}
    if not _THEME_RCS.search(message or "") and "任务" not in (message or "") and "AMR" not in (message or "").upper():
        # 非 RCS 主题不强拉，仍允许尝试 map/task 若用户明确要大屏
        pass

    live_hits = 0
    try:
        from integrations.rcs.http_adapter import invoke_capability, AdapterError
    except Exception as e:
        meta["error"] = f"adapter_import: {e}"
        return charts, "simulated", meta

    # 1) 任务列表 → 刷新 combo / bar 任务相关面板
    try:
        task_res = await invoke_capability("task.list", {"limit": 50})
        meta["attempts"].append({"cap": "task.list", "ok": True})
        meta["live_caps"].append("task.list")
        live_hits += 1
        items = task_res.get("data", {}).get("items")
        if items is None:
            items = task_res.get("raw")
        # 粗略统计：若是 list 则按状态聚合；否则保留模拟
        if isinstance(items, list) and items:
            status_counts: Dict[str, int] = {}
            for it in items:
                if not isinstance(it, dict):
                    continue
                st = str(it.get("status") or it.get("Status") or it.get("taskStatus") or "Unknown")
                status_counts[st] = status_counts.get(st, 0) + 1
            if status_counts:
                for c in charts:
                    title = str(c.get("title") or "")
                    if c.get("type") == "pie" and ("状态" in title or "Status" in title or "机器人" in title):
                        c["data"] = [
                            {"name": k, "name_en": k, "value": v}
                            for k, v in list(status_counts.items())[:8]
                        ]
                    if c.get("type") == "bar" and ("任务" in title or "效率" in title or "设备" in title):
                        c["x_data"] = list(status_counts.keys())[:8]
                        c["y_data"] = [status_counts[k] for k in c["x_data"]]
        elif isinstance(items, dict):
            # ABP 分页常见 {items:[], totalCount}
            inner = items.get("items") or items.get("Items") or []
            if isinstance(inner, list) and inner:
                meta["task_count"] = len(inner)
    except Exception as e:
        meta["attempts"].append({"cap": "task.list", "ok": False, "error": str(e)})

    # 2) AGV 状态 → 刷新地图点位（若返回坐标）
    try:
        agv_res = await invoke_capability("agv.status", {"limit": 50})
        meta["attempts"].append({"cap": "agv.status", "ok": True})
        meta["live_caps"].append("agv.status")
        live_hits += 1
        items = agv_res.get("data", {}).get("items")
        if items is None:
            items = agv_res.get("raw")
        pts = []
        if isinstance(items, dict):
            items = items.get("items") or items.get("Items") or []
        if isinstance(items, list):
            for it in items:
                if not isinstance(it, dict):
                    continue
                x = it.get("x") or it.get("X") or it.get("posX")
                y = it.get("y") or it.get("Y") or it.get("posY")
                if x is not None and y is not None:
                    name = str(it.get("name") or it.get("robotId") or it.get("id") or "AGV")
                    pts.append({"value": [float(x), float(y)], "name": name})
        if pts:
            for c in charts:
                if c.get("type") == "raw" and c.get("option") and isinstance(c["option"].get("series"), list):
                    # 覆盖「正常」机器人 series（effectScatter 第一个）
                    for s in c["option"]["series"]:
                        if s.get("name") == "正常" and s.get("type") == "effectScatter":
                            s["data"] = pts
                            break
                if c.get("type") == "scatter" and ("位置" in str(c.get("title") or "") or "地图" in str(c.get("title") or "")):
                    c["data"] = [p["value"] for p in pts]
    except Exception as e:
        meta["attempts"].append({"cap": "agv.status", "ok": False, "error": str(e)})

    # 3) 地图快照（可选）
    try:
        from integrations.rcs.binding_store import get_binding
        from integrations.rcs.profile_store import get_active_profile
        prof = get_active_profile()
        if prof and get_binding(prof["profile_id"], "map.snapshot"):
            snap = await invoke_capability("map.snapshot", {"include_paths": True})
            meta["attempts"].append({"cap": "map.snapshot", "ok": True})
            meta["live_caps"].append("map.snapshot")
            live_hits += 1
            robots = snap.get("data", {}).get("robots") or []
            if isinstance(robots, list) and robots:
                pts = []
                for r in robots:
                    if isinstance(r, dict) and r.get("x") is not None and r.get("y") is not None:
                        pts.append({"value": [float(r["x"]), float(r["y"])], "name": str(r.get("id") or "R")})
                for c in charts:
                    if c.get("type") == "raw" and c.get("option"):
                        for s in c["option"].get("series") or []:
                            if s.get("name") == "正常":
                                s["data"] = pts
    except Exception as e:
        meta["attempts"].append({"cap": "map.snapshot", "ok": False, "error": str(e)})

    if live_hits == 0:
        return charts, "simulated", meta
    if any(a.get("ok") is False for a in meta["attempts"]) and live_hits > 0:
        return charts, "mixed", meta
    return charts, "live", meta


def export_dashboard_file(layout: Dict[str, Any], charts: List[dict]) -> Tuple[str, Path]:
    from tools.sidea_sdk_template import export_dashboard

    sandbox = Path("sandbox_workspace")
    sandbox.mkdir(parents=True, exist_ok=True)
    tmp = sandbox / "chart_option.json"
    export_dashboard(
        layout["title"],
        charts,
        filename=str(tmp),
        title_en=layout.get("title_en"),
    )
    new_name = f"chart_{int(time.time() * 1000)}.json"
    dest = sandbox / new_name
    if dest.exists():
        dest.unlink()
    tmp.rename(dest)
    from core.public_url import public_url

    url = public_url(f"sandbox_workspace/{new_name}")
    return url, dest


# ---------------------------------------------------------------------------
# Freeform（商业模型）：完整 ECharts option，不再受模板面板类型约束
# ---------------------------------------------------------------------------

_FREEFORM_PROMPT = """你是顶级工业数字孪生大屏设计师（参考「智慧工厂数字孪生系统」风格）。请为用户需求设计一套有冲击力的监控大屏，直接输出完整 JSON（不要 markdown 围栏，不要解释）。

用户需求：
{message}

参考图分析（可空）：
{reference_analysis}

数据线索（可空，含 RCS 或模拟摘要）：
{data_hints}

输出 schema（必须严格遵守）：
{{
  "type": "dashboard",
  "title": "中文标题",
  "title_en": "English title",
  "layout": "2x3|3x3",
  "i18n": {{
    "zh-CN": {{"T_DASH_TITLE": "中文标题"}},
    "en": {{"T_DASH_TITLE": "English title"}}
  }},
  "insights": ["用具体数字写的观察1", "异常/瓶颈归因2", "可执行建议3"],
  "panels": [
    {{"id": "p0", "title": "面板中文名", "title_en": "Panel EN",
      "span": {{"col": 2, "row": 2}},
      "option": {{ /* 完整可运行的 ECharts option */ }} }}
  ]
}}

必须包含的面板组合（AMR/RCS 主题时）：
A. 英雄面板 p0（span 2x2）「AMR 厂区仿真地图」，option 配方（照此结构填真实数据）：
   - xAxis/yAxis: {{"type":"value","min":0,"max":100,"show":false}}
   - series[0] 库区分区: {{"type":"scatter","data":[],"markArea":{{"silent":true,"data":[[{{"name":"存储区A","coord":[2,55],"itemStyle":{{"color":"rgba(34,211,238,0.08)","borderColor":"rgba(34,211,238,0.5)","borderWidth":1}}}},{{"coord":[38,95]}}], ...更多分区（充电区/出入库口/产线接驳区）]}}}}
   - series[1] AMR 车辆: {{"type":"effectScatter","symbolSize":14,"rippleEffect":{{"brushType":"stroke","scale":3.5}},"data":[{{"name":"AMR-01","value":[12,70],"itemStyle":{{"color":"#34d399"}}}}, ...8~14 台，busy 绿色/idle 蓝色/充电黄色/故障红色]，"label":{{"show":true,"formatter":"{{b}}","position":"top","color":"#e2e8f0","fontSize":9}}}}
   - series[2] 任务路径: {{"type":"lines","coordinateSystem":"cartesian2d","polyline":true,"effect":{{"show":true,"period":4,"trailLength":0.6,"symbol":"arrow","symbolSize":7,"color":"#22d3ee"}},"lineStyle":{{"color":"rgba(34,211,238,0.35)","width":1.5,"curveness":0.15}},"data":[{{"coords":[[12,70],[30,55],[52,40]]}}, ...4~6 条]}}
B. 一个 3D 面板（span 可 1x2）：bar3D 库区负载/热度，必须含
   {{"grid3D":{{"boxWidth":170,"boxDepth":110,"viewControl":{{"autoRotate":true,"autoRotateSpeed":6,"distance":180}},"light":{{"main":{{"intensity":1.2,"shadow":true}}}}}},"xAxis3D":{{"type":"category"}},"yAxis3D":{{"type":"category"}},"zAxis3D":{{"type":"value"}},"visualMap":{{"max":100,"inRange":{{"color":["#1e3a5f","#22d3ee","#34d399","#fbbf24","#ef4444"]}}}},"series":[{{"type":"bar3D","shading":"lambert","data":[[i,j,v],...8x8]}}]}}
C. 双仪表盘 gauge 面板：稼动率 + 自动化率，series type=gauge，两个 gauge 用 center 分列左右，
   带 "progress":{{"show":true,"roundCap":true}}、"axisLine":{{"lineStyle":{{"width":14,"color":[[0.6,"#ef4444"],[0.85,"#fbbf24"],[1,"#34d399"]]}}}}、动画 "animationDuration":1500
D. 任务效率 combo（bar 任务完成数 + line 效率%双轴）；机器人状态 pie（环形 radius ["45%","68%"]，含 itemStyle borderRadius）
E. 可选：任务响应时长趋势 line（areaStyle 渐变）

硬性规则：
1. panels 5~6 个；p0 必须是上面的英雄地图且 span 2x2
2. 所有 series 的 data 必须非空、数值真实合理有异常点（如某台 AMR 故障、某库区负载 95 超标）
3. 深色工业风：backgroundColor transparent；主色 #22d3ee/#3b82f6/#a78bfa/#34d399/#fbbf24；文字 #e2e8f0
4. 动画必须有：effectScatter ripple、lines trail、grid3D autoRotate、gauge/bar 的 animationDuration
5. 标题用 i18n 占位符 T_P0..T_Pn，在 i18n.zh-CN / i18n.en 填齐
6. insights 引用你编入的具体数字（吞吐、稼动率%、故障台数、超载库区）
7. 只输出一个 JSON 对象，禁止注释、禁止省略号
"""


def _write_dashboard_payload(payload: dict) -> Tuple[str, Path]:
    sandbox = Path("sandbox_workspace")
    sandbox.mkdir(parents=True, exist_ok=True)
    new_name = f"chart_{int(time.time() * 1000)}.json"
    dest = sandbox / new_name
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    from core.public_url import public_url

    url = public_url(f"sandbox_workspace/{new_name}")
    return url, dest


def _series_has_data(s: Any) -> bool:
    """series 有可渲染内容：data 非空，或携带 markArea/markLine/markPoint。"""
    if not isinstance(s, dict):
        return False
    data = s.get("data")
    if isinstance(data, list) and len(data) > 0:
        return True
    for mk in ("markArea", "markLine", "markPoint"):
        m = s.get(mk)
        if isinstance(m, dict) and isinstance(m.get("data"), list) and m["data"]:
            return True
    return False


def _option_renderable(option: dict) -> bool:
    """面板 option 至少有一个带数据的 series，否则前端会渲染成空白块。"""
    series = option.get("series")
    if isinstance(series, dict):
        series = [series]
    if not isinstance(series, list) or not series:
        return False
    return any(_series_has_data(s) for s in series)


def _is_map_like_option(option: dict) -> bool:
    """判定是否像「厂区仿真地图」：含 effectScatter/lines/markArea 之一。"""
    series = option.get("series")
    if isinstance(series, dict):
        series = [series]
    if not isinstance(series, list):
        return False
    has_moving = any(
        isinstance(s, dict) and s.get("type") in ("effectScatter", "lines")
        for s in series
    )
    has_zone = any(
        isinstance(s, dict) and isinstance(s.get("markArea"), dict) for s in series
    )
    return has_moving or has_zone


def _build_hero_fallback_panel() -> dict:
    """AMR 主题下自由出图缺失/损坏英雄面板时，注入模板档的厂区仿真地图。"""
    rng = random.Random(int(time.time()) // 3600)
    option = _build_amr_floor_option(rng)
    option["title"] = {"text": "T_P_HERO", "left": "center", "textStyle": {"color": "#e2e8f0"}}
    return {
        "id": "p_hero",
        "title": "T_P_HERO",
        "span": {"col": 2, "row": 2},
        "option": option,
        "_hero_zh": "AMR 厂区实时仿真地图",
        "_hero_en": "AMR Live Floor Simulation Map",
    }


def _normalize_freeform_dashboard(raw: Optional[dict], message: str) -> Optional[dict]:
    """校验自由出图 JSON；失败返回 None 以便回落模板档。"""
    if not raw or not isinstance(raw, dict):
        return None
    panels = raw.get("panels")
    if not isinstance(panels, list) or len(panels) < 2:
        return None

    title = str(raw.get("title") or "工业监控大屏").strip()
    title_en = str(raw.get("title_en") or "Industrial Dashboard").strip()
    i18n = raw.get("i18n") if isinstance(raw.get("i18n"), dict) else {}
    zh = i18n.get("zh-CN") if isinstance(i18n.get("zh-CN"), dict) else {}
    en = i18n.get("en") if isinstance(i18n.get("en"), dict) else {}
    zh = dict(zh)
    en = dict(en)
    zh.setdefault("T_DASH_TITLE", title)
    en.setdefault("T_DASH_TITLE", title_en)

    out_panels: List[dict] = []
    for i, p in enumerate(panels[:8]):
        if not isinstance(p, dict):
            continue
        option = p.get("option")
        if not isinstance(option, dict):
            continue
        # 空面板拒绝：所有 series 均无 data（前端会渲染成大空白块）
        if not _option_renderable(option):
            logger.warning(f"freeform panel dropped (no renderable series): id={p.get('id')} title={p.get('title')}")
            continue
        pid = str(p.get("id") or f"p{i}")
        pt = str(p.get("title") or f"面板{i+1}")
        pt_en = str(p.get("title_en") or f"Panel {i+1}")
        tkey = f"T_P{i}"
        zh[tkey] = pt
        en[tkey] = pt_en
        # 确保 option 有 title
        if not option.get("title"):
            option = {**option, "title": {"text": tkey, "left": "center", "textStyle": {"color": "#e2e8f0"}}}
        elif isinstance(option.get("title"), dict) and not option["title"].get("text"):
            option = {**option, "title": {**option["title"], "text": tkey}}
        option = {**option, "backgroundColor": option.get("backgroundColor") or "transparent"}
        item: Dict[str, Any] = {"id": pid, "title": tkey, "option": option}
        span = p.get("span")
        if isinstance(span, dict) and span.get("col"):
            try:
                item["span"] = {
                    "col": max(1, min(3, int(span.get("col") or 1))),
                    "row": max(1, min(3, int(span.get("row") or 1))),
                }
            except Exception:
                pass
        out_panels.append(item)

    if len(out_panels) < 2:
        return None

    # AMR/RCS 主题：若没有合格的英雄地图面板（span>=2 且含 effectScatter/lines/markArea），
    # 注入模板档的厂区仿真地图兜底，避免出现「大空白英雄位」。
    if _THEME_RCS.search(message or ""):
        def _is_hero(it: dict) -> bool:
            span = it.get("span") or {}
            return int(span.get("col") or 1) >= 2 and _is_map_like_option(it.get("option") or {})

        if not any(_is_hero(it) for it in out_panels):
            hero = _build_hero_fallback_panel()
            zh[hero["title"]] = hero.pop("_hero_zh")
            en[hero["title"]] = hero.pop("_hero_en")
            # 移除模型给出的、被误标为英雄位但内容不像地图的面板 span，避免双英雄挤占布局
            for it in out_panels:
                span = it.get("span") or {}
                if int(span.get("col") or 1) >= 2 and int(span.get("row") or 1) >= 2:
                    it.pop("span", None)
            out_panels.insert(0, hero)
            logger.info("freeform: injected template AMR floor map as hero panel")

    insights = raw.get("insights")
    if not isinstance(insights, list):
        insights = []
    insights = [str(x).strip() for x in insights if str(x).strip()][:6]

    n = len(out_panels)
    layout = str(raw.get("layout") or "")
    # 面板数与模型声明不一致（有丢弃/注入）时重新计算布局
    if not layout or layout == "auto" or n != len(panels):
        cols = 2 if n <= 4 else 3
        rows = max(1, math.ceil(n / cols))
        layout = f"{cols}x{rows}"

    return {
        "type": "dashboard",
        "title": "T_DASH_TITLE",
        "layout": layout,
        "i18n": {"zh-CN": zh, "en": en},
        "panels": out_panels,
        "insights": insights,
        "_meta": {"title_zh": title, "title_en": title_en, "panel_count": len(out_panels)},
    }


def _summarize_option_data(option: dict, limit: int = 6) -> str:
    """从 ECharts option 抽数字摘要，供商业档解读引用。"""
    bits: List[str] = []
    title = ""
    t = option.get("title")
    if isinstance(t, dict):
        title = str(t.get("text") or "")
    elif isinstance(t, str):
        title = t
    series = option.get("series")
    if not isinstance(series, list):
        return title
    for s in series[:3]:
        if not isinstance(s, dict):
            continue
        name = s.get("name") or s.get("type") or "系列"
        data = s.get("data")
        if not isinstance(data, list) or not data:
            continue
        nums: List[float] = []
        for d in data[:40]:
            if isinstance(d, (int, float)):
                nums.append(float(d))
            elif isinstance(d, dict) and isinstance(d.get("value"), (int, float)):
                nums.append(float(d["value"]))
            elif isinstance(d, (list, tuple)) and d and isinstance(d[-1], (int, float)):
                nums.append(float(d[-1]))
        if nums:
            bits.append(
                f"{name}: n={len(data)} min={min(nums):.2f} max={max(nums):.2f} avg={sum(nums)/len(nums):.2f}"
            )
        if len(bits) >= limit:
            break
    head = f"[{title}] " if title else ""
    return head + "; ".join(bits)


async def _build_data_hints(message: str) -> Tuple[str, str, dict]:
    """尝试 RCS 真数摘要；失败则给场景提示。返回 (hints, data_source, live_meta)。"""
    live_meta: dict = {"live_caps": []}
    data_source = "simulated"
    hints = "无外部真数，请按工业 RCS/AMR 场景自行构造合理、有异常点的仿真数据。"
    try:
        # 复用现有模拟骨架拿一点结构，再尝试 live 覆盖
        layout = _default_layout_for(message)
        charts = simulate_all(layout, message)
        charts, data_source, live_meta = await enrich_charts_with_live_rcs(charts, message)
        lines = [f"数据来源标记: {data_source}"]
        for c in charts[:6]:
            lines.append(f"- type={c.get('type')} title={c.get('title')} keys={list(c.keys())[:8]}")
        if live_meta.get("live_caps"):
            lines.append(f"已接通 RCS 能力: {', '.join(live_meta['live_caps'])}")
        hints = "\n".join(lines)
    except Exception as e:
        logger.warning(f"freeform data hints failed: {e}")
    return hints, data_source, live_meta


async def run_freeform_dashboard_goal(
    message: str,
    llm=None,
    skill_name: str = "",
    attachments: Optional[List[str]] = None,
    profile: Optional[dict] = None,
) -> AsyncIterator[dict]:
    """商业/强模型：自由生成完整 ECharts dashboard。失败则调用方应回落模板档。"""
    from integrations.llm.capability_tier import tier_label

    tools_called: List[str] = []
    image_paths = _resolve_image_paths(attachments)
    profile = profile or {}
    model_label = f"{profile.get('provider', '?')}/{profile.get('model_name', '?')}"

    yield _evt(
        "tool_start",
        "goal_orchestrator",
        "自由出图档：商业模型直接设计完整大屏 JSON",
        input={
            "tier": "freeform",
            "model": model_label,
            "reference_images": [p.name for p in image_paths],
        },
    )
    yield _token(
        f"\n\n✨ **自由出图模式**（{tier_label('freeform')}）\n"
        f"当前模型：`{model_label}`\n"
        "执行链：`参考图解析` → `数据线索` → `自由设计完整 ECharts` → `导出` → `深度解读`\n\n"
    )
    yield _evt("tool_end", "goal_orchestrator", "自由出图方案就绪", output={"tier": "freeform"})
    tools_called.append("goal_orchestrator")

    reference_analysis = ""
    ref_source = "none"
    if image_paths:
        yield _evt("tool_start", "goal:analyze_reference", "子任务：解析参考大屏布局")
        reference_analysis, ref_source = await _analyze_reference_images(llm, image_paths, message)
        preview = reference_analysis[:500] + ("…" if len(reference_analysis) > 500 else "")
        yield _token(f"**⓪ 参考图解析**（{ref_source}）\n\n{preview}\n\n")
        yield _evt("tool_end", "goal:analyze_reference", "参考图分析完成", output={"source": ref_source})
        tools_called.append("goal:analyze_reference")

    yield _evt("tool_start", "goal:data_hints", "子任务：收集数据线索（优先 RCS 真数）")
    data_hints, data_source, live_meta = await _build_data_hints(message)
    yield _token(f"**① 数据线索**（来源: {data_source}）\n\n")
    yield _evt(
        "tool_end",
        "goal:data_hints",
        "数据线索就绪",
        output={"data_source": data_source, "live_meta": live_meta},
    )
    tools_called.append("goal:data_hints")
    if live_meta.get("live_caps"):
        tools_called.extend([f"rcs:{c}" for c in live_meta["live_caps"]])

    if llm is None:
        yield _evt("tool_error", "goal:freeform_design", "无 LLM，无法自由出图")
        yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": "no_llm"}}
        return

    yield _evt("tool_start", "goal:freeform_design", "子任务：生成完整 ECharts dashboard JSON")
    raw = None
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        prompt = _FREEFORM_PROMPT.format(
            message=message,
            reference_analysis=reference_analysis or "（无参考图）",
            data_hints=data_hints,
        )
        resp = await llm.ainvoke([
            SystemMessage(content="你只输出合法 JSON 对象。禁止 markdown 代码围栏。option 必须可直接被 ECharts 渲染。"),
            HumanMessage(content=prompt),
        ])
        content = getattr(resp, "content", "") or ""
        if isinstance(content, list):
            content = "".join(
                (x.get("text") if isinstance(x, dict) else str(x)) for x in content
            )
        raw = _extract_json(str(content))
    except Exception as e:
        logger.warning(f"freeform LLM failed: {e}")
        yield _evt("tool_error", "goal:freeform_design", "自由设计失败", error=str(e))
        yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": str(e)}}
        return

    payload = _normalize_freeform_dashboard(raw, message)
    if not payload:
        yield _token("⚠️ 自由出图 JSON 校验未通过，将回落模板流水线…\n\n")
        yield _evt("tool_error", "goal:freeform_design", "JSON 校验失败，回落模板")
        yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": "invalid_json"}}
        return

    meta = payload.pop("_meta", {})
    insights = payload.pop("insights", [])
    panel_count = meta.get("panel_count") or len(payload.get("panels") or [])
    yield _token(
        f"**② 自由设计完成**\n"
        f"- 标题：{meta.get('title_zh')}\n"
        f"- 面板：{panel_count}\n"
        f"- 布局：{payload.get('layout')}\n\n"
    )
    yield _evt(
        "tool_end",
        "goal:freeform_design",
        "完整 dashboard JSON 已生成",
        output={"panel_count": panel_count, "layout": payload.get("layout"), "title": meta.get("title_zh")},
    )
    tools_called.append("goal:freeform_design")

    yield _evt("tool_start", "goal:export_dashboard", "子任务：写出交互大屏文件")
    url = None
    try:
        url, path = _write_dashboard_payload(payload)
        block = f"```echarts-i18n\n{url}\n```"
        yield _token(f"**③ 导出成功**\n\n{block}\n\n")
        yield _evt("tool_end", "goal:export_dashboard", "大屏已导出", output={"url": url, "path": str(path)})
        tools_called.append("goal:export_dashboard")
    except Exception as e:
        yield _token(f"\n\n❌ 导出失败: {e}\n\n")
        yield _evt("tool_error", "goal:export_dashboard", "导出失败", error=str(e))
        yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": f"export:{e}"}}
        return

    # 深度解读：带上 insights + 各面板数据摘要
    yield _evt("tool_start", "goal:narrate", "子任务：基于真实面板数据做深度解读")
    data_briefs = []
    for p in payload.get("panels") or []:
        opt = p.get("option") or {}
        brief = _summarize_option_data(opt)
        if brief:
            data_briefs.append(f"- {p.get('id')}: {brief}")
    narration = ""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        resp = await llm.ainvoke([
            SystemMessage(
                content=(
                    "你是资深工业运营分析师。用中文写 5~8 句深度解读："
                    "必须引用具体数字；指出异常与根因；给出可执行建议；标明数据来源可信度。"
                    "不要代码，不要 URL，不要客套。"
                )
            ),
            HumanMessage(
                content=(
                    f"用户需求：{message}\n"
                    f"大屏标题：{meta.get('title_zh')}\n"
                    f"数据来源：{data_source}\n"
                    f"模型预置洞察：{json.dumps(insights, ensure_ascii=False)}\n"
                    f"面板数据摘要：\n" + ("\n".join(data_briefs) or "（无）") + "\n"
                    + (f"参考图要点：{reference_analysis[:400]}\n" if reference_analysis else "")
                )
            ),
        ])
        narration = (getattr(resp, "content", "") or "").strip()
    except Exception as e:
        logger.warning(f"freeform narrate failed: {e}")
    if not narration:
        if insights:
            narration = "\n".join(f"- {x}" for x in insights)
        else:
            narration = (
                f"已以自由出图交付「{meta.get('title_zh')}」（{panel_count} 面板）。"
                f"数据来源：{data_source}。"
            )
    yield _token(f"**④ 深度业务解读**\n\n{narration}\n")
    yield _evt("tool_end", "goal:narrate", "解读完成", output=narration[:400])
    tools_called.append("goal:narrate")

    yield {
        "id": uuid.uuid4().hex,
        "type": "_goal_meta",
        "data": {
            "tools_called": tools_called,
            "url": url,
            "tier": "freeform",
            "layout": {
                "title": meta.get("title_zh"),
                "panel_count": panel_count,
                "source": "freeform",
            },
            "skill_hint": skill_name,
            "reference_source": ref_source,
            "data_source": data_source,
            "live_meta": live_meta,
            "model": model_label,
        },
    }


async def run_dashboard_goal(
    message: str,
    llm=None,
    skill_name: str = "",
    attachments: Optional[List[str]] = None,
) -> AsyncIterator[dict]:
    """异步产出与 chat SSE 兼容的事件。按模型能力档自动选 template / freeform。"""
    from integrations.llm.capability_tier import detect_dashboard_tier, tier_label
    from integrations.llm.profile_store import get_active_profile

    profile = get_active_profile(mask_key=True) or {}
    tier = detect_dashboard_tier(profile)

    if tier == "freeform":
        fallback = False
        async for ev in run_freeform_dashboard_goal(
            message,
            llm=llm,
            skill_name=skill_name,
            attachments=attachments,
            profile=profile,
        ):
            if ev.get("type") == "_goal_fallback":
                fallback = True
                logger.warning(f"freeform fallback to template: {ev.get('data')}")
                continue
            yield ev
        if not fallback:
            return
        yield _token(
            f"\n\n↩️ 已回落 **{tier_label('template')}**（商业档出图未通过校验）。\n\n"
        )

    # ---- 以下为模板档（小模型稳定路径）----
    tools_called: List[str] = []
    image_paths = _resolve_image_paths(attachments)

    steps = ["analyze_reference", "plan_layout", "simulate_data", "export", "narrate"] if image_paths else [
        "plan_layout", "simulate_data", "export", "narrate"
    ]
    yield _evt(
        "tool_start",
        "goal_orchestrator",
        "目标模式：将大屏任务拆分为子任务串联执行",
        input={
            "steps": steps,
            "tier": "template",
            "model": f"{profile.get('provider')}/{profile.get('model_name')}",
            "reference_images": [p.name for p in image_paths],
        },
    )
    intro = (
        f"\n\n🧭 **目标模式已启动**（{tier_label('template')}）\n"
        + (
            f"检测到 **{len(image_paths)}** 张参考图，将优先模仿其布局骨架。\n"
            if image_paths else ""
        )
        + "执行链："
        + ("`参考图解析` → " if image_paths else "")
        + "`布局规划` → `数据模拟` → `导出大屏` → `业务解读`\n\n"
    )
    yield _token(intro)
    yield _evt("tool_end", "goal_orchestrator", "拆分方案已就绪", output={"steps": steps, "tier": "template"})
    tools_called.append("goal_orchestrator")

    # 0. 参考图
    reference_analysis = ""
    ref_source = "none"
    if image_paths:
        yield _evt(
            "tool_start",
            "goal:analyze_reference",
            f"子任务：解析参考大屏布局（{', '.join(p.name for p in image_paths)}）",
            input={"files": [str(p) for p in image_paths]},
        )
        reference_analysis, ref_source = await _analyze_reference_images(llm, image_paths, message)
        preview = reference_analysis[:500] + ("…" if len(reference_analysis) > 500 else "")
        yield _token(f"**⓪ 参考图解析**（来源: {ref_source}）\n\n{preview}\n\n")
        yield _evt(
            "tool_end",
            "goal:analyze_reference",
            "参考图分析完成",
            output={"source": ref_source, "chars": len(reference_analysis)},
        )
        tools_called.append("goal:analyze_reference")

    # 1. 布局
    yield _evt("tool_start", "goal:plan_layout", "子任务：规划大屏布局与面板类型", input=message[:200])
    layout_raw = None
    layout_source = "template"
    if llm is not None:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            prompt = _LAYOUT_PROMPT.format(
                message=message,
                reference_analysis=reference_analysis or "（无参考图，按用户文字需求规划）",
            )
            resp = await llm.ainvoke([
                SystemMessage(content="你只输出合法 JSON，禁止 markdown 代码围栏。有参考图时必须模仿其信息架构。"),
                HumanMessage(content=prompt),
            ])
            content = getattr(resp, "content", "") or ""
            layout_raw = _extract_json(content if isinstance(content, str) else str(content))
            if layout_raw:
                layout_source = "llm+reference" if reference_analysis else "llm"
        except Exception as e:
            logger.warning(f"layout LLM failed: {e}")

    layout = _normalize_layout(layout_raw, message, reference_analysis=reference_analysis)
    if reference_analysis and layout_source == "template":
        layout_source = f"template+{ref_source}"
    layout_summary = {
        "title": layout["title"],
        "composition": layout.get("composition"),
        "panels": [{"id": p["id"], "type": p["type"], "title": p["title"]} for p in layout["panels"]],
        "source": layout_source,
        "reference_source": ref_source,
        "tier": "template",
    }
    step1 = (
        f"**① 布局规划**（来源: {layout_source}）\n"
        f"- 标题：{layout['title']}\n"
        f"- 构图：{layout.get('composition', 'grid')}\n"
        f"- 面板数：{len(layout['panels'])}\n"
        + "".join(f"  - `{p['type']}` {p['title']}\n" for p in layout["panels"])
        + "\n"
    )
    yield _token(step1)
    yield _evt("tool_end", "goal:plan_layout", "布局完成", output=layout_summary)
    tools_called.append("goal:plan_layout")

    # 2. 数据：先模拟骨架，再尝试 RCS 真数覆盖
    yield _evt("tool_start", "goal:simulate_data", "子任务：准备面板数据（优先 RCS 真数，失败回落模拟）")
    charts = simulate_all(layout, message)
    charts, data_source, live_meta = await enrich_charts_with_live_rcs(charts, message)
    src_label = {"live": "live 真数", "mixed": "mixed 真数+模拟", "simulated": "simulated 模拟"}.get(
        data_source, data_source
    )
    step2 = (
        f"**② 数据准备**完成（来源: **{src_label}**），"
        f"共 {len(charts)} 个面板。"
        + (
            f" 已调用能力: {', '.join(live_meta.get('live_caps') or [])}。"
            if live_meta.get("live_caps")
            else " RCS 未连通或未绑定，使用本地模拟数据。"
        )
        + "\n\n"
    )
    yield _token(step2)
    yield _evt(
        "tool_end",
        "goal:simulate_data",
        "数据就绪",
        output={
            "panel_count": len(charts),
            "types": [c.get("type") for c in charts],
            "data_source": data_source,
            "live_meta": live_meta,
        },
    )
    tools_called.append("goal:simulate_data")
    if live_meta.get("live_caps"):
        tools_called.extend([f"rcs:{c}" for c in live_meta["live_caps"]])

    # 3. 导出
    yield _evt("tool_start", "goal:export_dashboard", "子任务：调用 SDK 导出交互大屏")
    url = None
    try:
        url, path = export_dashboard_file(layout, charts)
        block = f"```echarts-i18n\n{url}\n```"
        step3 = f"**③ 导出成功**\n\n{block}\n\n"
        yield _token(step3)
        yield _evt("tool_end", "goal:export_dashboard", "大屏已导出", output={"url": url, "path": str(path)})
        tools_called.append("goal:export_dashboard")
    except Exception as e:
        err = f"\n\n❌ 导出失败: {e}\n\n"
        yield _token(err)
        yield _evt("tool_error", "goal:export_dashboard", "导出失败", error=str(e))

    # 4. 解读
    yield _evt("tool_start", "goal:narrate", "子任务：生成简短业务解读")
    narration = ""
    if llm is not None and url:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            panel_lines = "\n".join(f"- {p['type']}: {p['title']}" for p in layout["panels"])
            resp = await llm.ainvoke([
                SystemMessage(content="你是工业数据分析师。用中文写 3~5 句业务解读，不要代码，不要 URL。"),
                HumanMessage(content=(
                    f"用户需求：{message}\n大屏标题：{layout['title']}\n面板：\n{panel_lines}\n"
                    + (f"参考图要点：{reference_analysis[:400]}\n" if reference_analysis else "")
                    + f"数据来源标记：{data_source}（live=RCS真数，simulated=本地模拟，mixed=混合）。\n"
                    + "请基于场景给出可执行的观察与建议，并点明数据来源可信度。"
                )),
            ])
            narration = (getattr(resp, "content", "") or "").strip()
        except Exception as e:
            logger.warning(f"narrate LLM failed: {e}")
            narration = ""
    if not narration:
        narration = (
            f"已交付「{layout['title']}」交互大屏（{len(layout['panels'])} 面板）。"
            + ("构图已按参考图的「中央地图 + 底部 KPI」信息架构组织。" if reference_analysis else "")
            + f"数据来源：{data_source}。"
            + (" 已尝试对接 RCS 连接器真数。" if data_source != "simulated" else " RCS 未连通时使用场景模拟，可用于汇报演示。")
        )
    step4 = f"**④ 业务解读**\n\n{narration}\n"
    yield _token(step4)
    yield _evt("tool_end", "goal:narrate", "解读完成", output=narration[:300])
    tools_called.append("goal:narrate")

    yield {
        "id": uuid.uuid4().hex,
        "type": "_goal_meta",
        "data": {
            "tools_called": tools_called,
            "url": url,
            "tier": "template",
            "layout": layout_summary,
            "skill_hint": skill_name,
            "reference_source": ref_source,
            "data_source": data_source,
            "live_meta": live_meta,
        },
    }
