"""商业模型沉浸档：沙箱构建 HTML + Three.js 数字孪生场景。

流程：
  1. 拆分需求（plan）
  2. 生成场景数据 JSON（或完整自定义 HTML）
  3. 注入精致 scaffold / 写出 scene_*.html
  4. 静态审核（体积、Three 引用、危险标签）
  5. 交付 ```scene-html``` URL 供前端 iframe 沙箱渲染

说明：
  - MVP 使用 CDN Three.js 单文件 HTML，避免沙箱内 npm/Unity 构建复杂度。
  - React/Vue/WPF/Unity 可作为后续「工程产物」扩展，协议仍是 scene URL。
"""
from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("agent.scene_pipeline")

ROOT = Path(__file__).resolve().parents[1]
SCAFFOLD = ROOT / "tools" / "scene_scaffold.html"
SCAFFOLD_PIXI = ROOT / "tools" / "scene_scaffold_pixi.html"
SANDBOX = ROOT / "sandbox_workspace"

_MAX_HTML_BYTES = 1_500_000
_FORBIDDEN = re.compile(
    r"<(?:script[^>]+src\s*=\s*['\"](?!https://unpkg\.com/(?:three|pixi\.js))[^'\"]+|iframe|object|embed|base)\b|"
    r"javascript:|document\.cookie|localStorage|fetch\s*\(|XMLHttpRequest|eval\s*\(",
    re.I,
)

_TRUE_3D = re.compile(
    r"(three\.?js|webgl|unity|gltf|真正的?\s*3D|三维建模|自由相机|orbit)",
    re.I,
)

_SCENE_DATA_PROMPT = """你是工业数字孪生场景导演。根据用户需求输出**一个 JSON 对象**（不要 markdown 围栏），用于驱动厂区场景脚手架。

用户需求：
{message}

参考图要点（可空）：
{reference_analysis}

数据线索：
{data_hints}

JSON schema：
{{
  "title": "中文标题",
  "subtitle": "英文或副标题",
  "status": "SIMULATED|LIVE",
  "engine": "pixi|three",
  "kpis": [{{"label":"今日任务","value":"1286","delta":"+12%"}}],
  "racks": [{{"x":-18,"z":-10,"w":4,"h":8,"d":16,"color":"#1d4ed8"}}],
  "robots": [{{"id":"AMR-01","x":-4,"z":0,"status":"busy|idle|charging|fault"}}],
  "paths": [[[-4,0],[0,2],[6,-2]]],
  "insights": ["具体数字观察1","异常归因2","可执行建议3"],
  "palette": {{"floor":"#111827","accent":"#22d3ee","amr":"#f59e0b"}},
  "mode": "scaffold",
  "model3d_keyword": "robot|agv|factory|machine"
}}

硬性规则：
1. racks 6~12 个，坐标合理不重叠；robots 6~12 台，至少 1 台 fault
2. paths 2~5 条，点落在通道上
3. kpis 4 个，insights 3 条，引用你编的具体数字
4. mode 固定 "scaffold"；engine 默认 "pixi"（2.5D 等轴测）。仅当用户明确要求真 3D/Three/WebGL/Unity 时用 "three"
5. 如果用户明确要求包含真 3D 模型实体（如机械臂、AGV、汽车等），请将 engine 设为 "three"，并在顶层输出 `model3d_keyword`。
6. 颜色深色工业风：蓝货架、琥珀 AMR、青路径
7. 只输出 JSON
"""


def _evt(etype: str, name: str, message: str, **extra) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "type": etype,
        "data": {"name": name, "message": message, **extra},
        "timestamp": int(time.time() * 1000),
    }


def _token(text: str) -> dict:
    return {"id": uuid.uuid4().hex, "type": "llm_token", "data": {"token": text}}


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else None
    except Exception:
        m = re.search(r"\{[\s\S]*\}", s)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None


def _default_scene_data(message: str) -> Dict[str, Any]:
    return {
        "title": "RCS AMR 数字孪生场景",
        "subtitle": "Warehouse digital twin · simulated fleet",
        "status": "SIMULATED",
        "kpis": [
            {"label": "今日任务", "value": "1286", "delta": "+12%"},
            {"label": "稼动率", "value": "82%", "delta": "+3.1%"},
            {"label": "在线车", "value": "27", "delta": "1 fault"},
            {"label": "自动化率", "value": "86%", "delta": "+1.8%"},
        ],
        "racks": [
            {"x": -18, "z": -10, "w": 4, "h": 8, "d": 16, "color": "#1d4ed8"},
            {"x": -10, "z": -10, "w": 4, "h": 8, "d": 16, "color": "#1e40af"},
            {"x": 10, "z": -10, "w": 4, "h": 8, "d": 16, "color": "#1d4ed8"},
            {"x": 18, "z": -10, "w": 4, "h": 8, "d": 16, "color": "#1e3a8a"},
            {"x": -18, "z": 12, "w": 4, "h": 7, "d": 14, "color": "#0e7490"},
            {"x": -10, "z": 12, "w": 4, "h": 7, "d": 14, "color": "#155e75"},
            {"x": 10, "z": 12, "w": 4, "h": 7, "d": 14, "color": "#0e7490"},
            {"x": 18, "z": 12, "w": 4, "h": 7, "d": 14, "color": "#164e63"},
        ],
        "robots": [
            {"id": "AMR-01", "x": -4, "z": 0, "status": "busy"},
            {"id": "AMR-02", "x": 2, "z": 3, "status": "busy"},
            {"id": "AMR-03", "x": 6, "z": -2, "status": "idle"},
            {"id": "AMR-04", "x": -1, "z": 6, "status": "fault"},
            {"id": "AMR-05", "x": 12, "z": 8, "status": "charging"},
            {"id": "AMR-06", "x": -8, "z": 4, "status": "busy"},
            {"id": "AMR-07", "x": 8, "z": -6, "status": "idle"},
            {"id": "AMR-08", "x": 0, "z": -4, "status": "busy"},
        ],
        "paths": [
            [[-4, 0], [0, 2], [6, -2], [12, 8]],
            [[2, 3], [4, 1], [8, 4]],
            [[-8, 4], [-2, 2], [2, 3]],
        ],
        "insights": [
            "AMR-04 故障，建议就近改派空闲车",
            "右翼货架区负载偏高，注意出库排队",
            f"需求关键词已纳入场景：{(message or '')[:40]}",
        ],
        "palette": {"floor": "#111827", "accent": "#22d3ee", "amr": "#f59e0b"},
        "mode": "scaffold",
        "engine": "pixi",
    }


def pick_scene_engine(message: str, scene_data: Optional[dict] = None) -> str:
    """Default Pixi 2.5D; Three.js when user explicitly wants true 3D."""
    if isinstance(scene_data, dict):
        eng = str(scene_data.get("engine") or "").strip().lower()
        if eng in ("pixi", "three"):
            return eng
    if _TRUE_3D.search(message or ""):
        return "three"
    return "pixi"


def _normalize_scene_data(raw: Optional[dict], message: str) -> Dict[str, Any]:
    base = _default_scene_data(message)
    if not isinstance(raw, dict):
        base["engine"] = pick_scene_engine(message, base)
        return base
    out = dict(base)
    for k in ("title", "subtitle", "status"):
        if raw.get(k):
            out[k] = str(raw[k])[:120]
    for k in ("kpis", "racks", "robots", "paths", "insights"):
        if isinstance(raw.get(k), list) and raw[k]:
            out[k] = raw[k]
    if isinstance(raw.get("palette"), dict):
        out["palette"] = {**out["palette"], **raw["palette"]}
    out["mode"] = "scaffold"
    out["engine"] = pick_scene_engine(message, raw)
    # ensure at least one fault
    robots = out.get("robots") or []
    if robots and not any(str(r.get("status")) == "fault" for r in robots if isinstance(r, dict)):
        if isinstance(robots[0], dict):
            robots[0]["status"] = "fault"
    
    model3d_keyword = raw.get("model3d_keyword")
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

    return out


def inject_scene_html(scene_data: Dict[str, Any]) -> str:
    engine = str(scene_data.get("engine") or "pixi").lower()
    scaffold = SCAFFOLD_PIXI if engine == "pixi" else SCAFFOLD
    if not scaffold.exists():
        raise FileNotFoundError(f"missing scaffold: {scaffold}")
    html = scaffold.read_text(encoding="utf-8")
    payload = json.dumps(scene_data, ensure_ascii=False)
    injection = f"<script>window.__SIDEA_SCENE__ = {payload};</script>\n"
    if "<body>" in html:
        html = html.replace("<body>", "<body>\n" + injection, 1)
    else:
        html = injection + html
    return html


def review_scene_html(html: str) -> Tuple[bool, str]:
    if not html or len(html.encode("utf-8")) < 500:
        return False, "html too small"
    if len(html.encode("utf-8")) > _MAX_HTML_BYTES:
        return False, "html too large"
    low = html.lower()
    has_pixi = "pixi" in low and ("application" in low or "PIXI" in html)
    has_three = "three" in low and ("WebGLRenderer" in html or "THREE" in html)
    if not has_pixi and not has_three:
        return False, "missing pixi.js or three.js renderer"
    return True, "ok"

def write_scene_file(html: str, prefix: str = "scene") -> Tuple[str, Path]:
    from core.public_url import public_url

    SANDBOX.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{int(time.time() * 1000)}.html"
    dest = SANDBOX / name
    dest.write_text(html, encoding="utf-8")
    return public_url(f"sandbox_workspace/{name}"), dest


async def run_scene_dashboard_goal(
    message: str,
    llm=None,
    skill_name: str = "",
    attachments: Optional[List[str]] = None,
    profile: Optional[dict] = None,
) -> AsyncIterator[dict]:
    """沉浸档：拆任务 → 生成场景数据 → 注入脚手架 → 审核交付。"""
    from integrations.llm.capability_tier import tier_label

    tools_called: List[str] = []
    profile = profile or {}
    model_label = f"{profile.get('provider', '?')}/{profile.get('model_name', '?')}"

    engine_guess = pick_scene_engine(message)
    eng_label = "PixiJS 2.5D 等轴测" if engine_guess == "pixi" else "Three.js 真 3D"
    yield _evt(
        "tool_start",
        "goal_orchestrator",
        f"沉浸档：沙箱构建 {eng_label} 数字孪生场景",
        input={"tier": "scene", "model": model_label, "engine": engine_guess},
    )
    yield _token(
        f"\n\n🎬 **沉浸场景模式**（{tier_label('scene')} · {eng_label}）\n"
        f"当前模型：`{model_label}`\n"
        f"执行链：`需求拆分` → `场景数据生成` → `沙箱注入 {eng_label} 脚手架` → `审核放行` → `iframe 交付`\n\n"
        "> 默认用 Pixi 2.5D 发挥精致大屏上限；明确要求真 3D 时切换 Three.js。\n\n"
    )
    yield _evt("tool_end", "goal_orchestrator", "沉浸方案就绪", output={"tier": "scene", "engine": engine_guess})
    tools_called.append("goal_orchestrator")

    # Optional reference analysis reused from goal_pipeline helpers
    reference_analysis = ""
    try:
        from agent.goal_pipeline import _resolve_image_paths, _analyze_reference_images, _build_data_hints

        image_paths = _resolve_image_paths(attachments)
        if image_paths and llm is not None:
            yield _evt("tool_start", "goal:analyze_reference", "子任务：解析参考图空间结构")
            reference_analysis, ref_source = await _analyze_reference_images(llm, image_paths, message)
            yield _token(f"**⓪ 参考图**（{ref_source}）\n\n{(reference_analysis or '')[:400]}\n\n")
            yield _evt("tool_end", "goal:analyze_reference", "参考图分析完成")
            tools_called.append("goal:analyze_reference")
        yield _evt("tool_start", "goal:data_hints", "子任务：收集 RCS/模拟数据线索")
        data_hints, data_source, live_meta = await _build_data_hints(message)
        yield _token(f"**① 数据线索**（{data_source}）\n\n")
        yield _evt("tool_end", "goal:data_hints", "数据线索就绪", output={"data_source": data_source})
        tools_called.append("goal:data_hints")
    except Exception as e:
        logger.warning(f"scene prelude failed: {e}")
        data_hints, data_source, live_meta = "simulated industrial scene", "simulated", {}

    yield _evt("tool_start", "goal:scene_plan", "子任务：拆分场景构建任务")
    plan_text = (
        "1. 厂区等轴测空间（货架/通道）或真 3D 几何\n"
        "2. AMR 车队与状态着色\n"
        "3. 任务路径动画\n"
        "4. HUD KPI / 洞察叠层\n"
        "5. 审核后 iframe 交付\n"
    )
    yield _token(f"**② 任务拆分**\n\n{plan_text}\n")
    yield _evt("tool_end", "goal:scene_plan", "任务拆分完成")
    tools_called.append("goal:scene_plan")

    yield _evt("tool_start", "goal:scene_author", "子任务：生成场景数据并写入沙箱 HTML")
    scene_data = _normalize_scene_data(None, message)
    if llm is not None:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage

            prompt = _SCENE_DATA_PROMPT.format(
                message=message,
                reference_analysis=reference_analysis or "（无）",
                data_hints=data_hints,
            )
            resp = await llm.ainvoke(
                [
                    SystemMessage(content="你只输出合法 JSON 对象。禁止 markdown 围栏。"),
                    HumanMessage(content=prompt),
                ]
            )
            content = getattr(resp, "content", "") or ""
            if isinstance(content, list):
                content = "".join(
                    (x.get("text") if isinstance(x, dict) else str(x)) for x in content
                )
            raw = _extract_json(str(content))
            scene_data = _normalize_scene_data(raw, message)
        except Exception as e:
            logger.warning(f"scene LLM author failed: {e}")
            scene_data = _normalize_scene_data(None, message)

    try:
        html = inject_scene_html(scene_data)
        ok, reason = review_scene_html(html)
        if not ok:
            yield _token(f"⚠️ 场景审核未通过（{reason}），使用默认精修脚手架重试…\n\n")
            html = inject_scene_html(_normalize_scene_data(None, message))
            ok, reason = review_scene_html(html)
            if not ok:
                yield _evt("tool_error", "goal:scene_author", "场景审核失败", error=reason)
                yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": reason}}
                return
        url, path = write_scene_file(html)
    except Exception as e:
        logger.warning(f"scene write failed: {e}")
        yield _evt("tool_error", "goal:scene_author", "场景写出失败", error=str(e))
        yield {"id": uuid.uuid4().hex, "type": "_goal_fallback", "data": {"reason": str(e)}}
        return

    eng = scene_data.get("engine") or "pixi"
    yield _token(
        f"**③ 沙箱写出完成**\n"
        f"- 引擎：`{eng}`\n"
        f"- 文件：`{path.name}`\n"
        f"- 货架：{len(scene_data.get('racks') or [])}\n"
        f"- 车辆：{len(scene_data.get('robots') or [])}\n\n"
        f"```scene-html\n{url}\n```\n\n"
    )
    yield _evt(
        "tool_end",
        "goal:scene_author",
        "场景 HTML 已导出",
        output={
            "url": url,
            "path": str(path),
            "engine": eng,
            "robots": len(scene_data.get("robots") or []),
        },
    )
    tools_called.append("goal:scene_author")

    yield _evt("tool_start", "goal:scene_review", "子任务：组合审核放行")
    yield _token(
        "**④ 审核放行**\n"
        f"- 渲染引擎：{eng}（CDN 脚手架）\n"
        "- 体积与危险标签：通过\n"
        "- 前端将以沙箱 iframe 渲染（无父页 cookie 访问）\n\n"
    )
    yield _evt("tool_end", "goal:scene_review", "审核通过")
    tools_called.append("goal:scene_review")

    insights = scene_data.get("insights") or []
    narration = "\n".join(f"- {x}" for x in insights) if insights else "场景已交付。"
    yield _token(f"**⑤ 场景解读**\n\n{narration}\n")
    yield {
        "id": uuid.uuid4().hex,
        "type": "_goal_meta",
        "data": {
            "tools_called": tools_called,
            "url": url,
            "tier": "scene",
            "layout": {
                "title": scene_data.get("title"),
                "panel_count": 1,
                "source": "scene_html",
            },
            "skill_hint": skill_name,
            "data_source": data_source,
            "live_meta": live_meta,
            "model": model_label,
        },
    }
