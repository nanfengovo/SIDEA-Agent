"""按 Active LLM Profile 判定大屏能力档位。

- template：小模型友好，固定面板类型 + SDK 模板拼装（现状 Goal 流水线）
- freeform：商业/强模型，直接生成完整 ECharts dashboard JSON
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Optional

DashboardTier = Literal["template", "freeform"]

# Ollama 本地大模型可视为接近商业档（可选放开）
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


def detect_dashboard_tier(profile: Optional[Dict[str, Any]] = None) -> DashboardTier:
    """根据 Profile 判定大屏生成策略。"""
    if not profile:
        try:
            from integrations.llm.profile_store import get_active_profile

            profile = get_active_profile(mask_key=True) or {}
        except Exception:
            profile = {}

    extra = profile.get("extra_config") or {}
    if isinstance(extra, dict):
        override = str(extra.get("dashboard_tier") or "").strip().lower()
        if override in ("template", "freeform"):
            return override  # type: ignore

    provider = (profile.get("provider") or "ollama").strip().lower()
    model = (profile.get("model_name") or "").strip().lower()

    if provider in ("openai", "openai_compatible", "gemini_native"):
        return "freeform"

    if provider == "ollama" and any(k in model for k in _LARGE_LOCAL):
        return "freeform"

    return "template"


def tier_label(tier: DashboardTier) -> str:
    return {
        "template": "模板流水线（小模型稳定档）",
        "freeform": "自由出图（商业/强模型档）",
    }.get(tier, tier)
