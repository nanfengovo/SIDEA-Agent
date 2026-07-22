"""按 Active LLM Profile 判定大屏能力档位。

- template：小模型。DSL v2 + 固定 widget + 模拟/真数填充
- freeform：商业/强模型。LLM 生成 DSL v2 layout+data（英雄位优先 amr_iso_map）
- scene：商业模型沉浸档。沙箱 HTML（默认 Pixi 2.5D / 真 3D 用 Three）iframe

注意：「数字孪生风格大屏」若同时要求仪表盘/趋势/环形等多面板，走 freeform+iso，
而不是纯 scene（否则会丢掉周边图表，看起来仍像「没改好」）。
"""
from __future__ import annotations

import re
from typing import Any, Dict, Literal, Optional

DashboardTier = Literal["template", "freeform", "scene"]

_LARGE_LOCAL = (
    "70b",
    "72b",
    "65b",
    "34b",
    "32b",
    "27b",
    "qwen2.5:32",
    "qwen2.5:72",
    "llama3.1:70",
    "llama3.3",
    "deepseek-r1",
    "gemma3:27",
)

# 明确要「单独沉浸场景 / 真 3D 沙箱」才进 scene
_SCENE_ONLY = re.compile(
    r"(three\.?js|webgl|unity|gltf|沉浸场景|立体厂区场景|三维场景|"
    r"3D\s*场景|仿真场景|真正的?\s*3D|厂区三维|沙箱场景|"
    r"用\s*pixi|pixijs|等轴测场景)",
    re.I,
)

# 多面板大屏意图：即使带「数字孪生」也应走 freeform（iso 英雄位 + 图表）
_MULTI_PANEL_DASH = re.compile(
    r"(大屏|仪表盘|双轴|环形|趋势|稼动率|自动化率|负载图|bar3d|"
    r"监控面板|四宫格|多面板|任务完成数|机器人状态)",
    re.I,
)

# 弱孪生词： alone 不足以进 scene
_TWIN_STYLE = re.compile(r"(数字孪生|孪生风格|厂区仿真)", re.I)


def wants_scene(message: str) -> bool:
    """True only when user wants immersive sandbox scene, not multi-panel twin-style dashboard."""
    msg = message or ""
    if _SCENE_ONLY.search(msg):
        return True
    # 「数字孪生」+ 多面板大屏 → 不是 scene
    if _TWIN_STYLE.search(msg) and _MULTI_PANEL_DASH.search(msg):
        return False
    # 纯「数字孪生场景」类短意图
    if _TWIN_STYLE.search(msg) and not _MULTI_PANEL_DASH.search(msg):
        return True
    return False


def detect_dashboard_tier(profile: Optional[Dict[str, Any]] = None, message: str = "") -> DashboardTier:
    """根据 Profile + 用户意图判定大屏生成策略。"""
    if not profile:
        try:
            from integrations.llm.profile_store import get_active_profile

            profile = get_active_profile(mask_key=True) or {}
        except Exception:
            profile = {}

    extra = profile.get("extra_config") or {}
    if isinstance(extra, dict):
        override = str(extra.get("dashboard_tier") or "").strip().lower()
        if override in ("template", "freeform", "scene"):
            return override  # type: ignore

    provider = (profile.get("provider") or "ollama").strip().lower()
    model = (profile.get("model_name") or "").strip().lower()
    commercial = provider in ("openai", "openai_compatible", "gemini_native") or (
        provider == "ollama" and any(k in model for k in _LARGE_LOCAL)
    )

    if wants_scene(message):
        return "scene"

    if commercial:
        return "freeform"

    return "template"


def tier_label(tier: DashboardTier) -> str:
    return {
        "template": "模板流水线（DSL v2 · 小模型稳定档）",
        "freeform": "自由编排（DSL v2 · Pixi 英雄位）",
        "scene": "沙箱场景构建（Pixi 2.5D / Three.js · 沉浸档）",
    }.get(tier, tier)
