"""Scene pipeline + capability tier tests."""
from __future__ import annotations

from agent.scene_pipeline import (
    inject_scene_html,
    review_scene_html,
    pick_scene_engine,
    _default_scene_data,
    _normalize_scene_data,
)
from integrations.llm.capability_tier import detect_dashboard_tier, wants_scene, tier_label


def test_wants_scene_keywords():
    assert wants_scene("做一套精致的 Three.js 数字孪生场景")
    assert wants_scene("用 Three.js 沉浸场景")
    assert wants_scene("等轴测场景沙箱")
    assert not wants_scene("做一个任务完成率柱状图")
    # 多面板「数字孪生风格大屏」应走 freeform+iso，不是纯 scene
    assert not wants_scene(
        "以 RCS AMR 为主题生成数字孪生风格大屏：中央厂区仿真地图；稼动率双仪表盘；趋势；环形图"
    )


def test_tier_scene_for_commercial_with_intent():
    profile = {"provider": "openai", "model_name": "gpt-4o", "extra_config": {}}
    assert detect_dashboard_tier(profile, message="生成三维场景数字孪生") == "scene"
    assert detect_dashboard_tier(profile, message="任务吞吐趋势图") == "freeform"
    assert (
        detect_dashboard_tier(
            profile,
            message="数字孪生风格大屏：中央厂区地图、稼动率仪表盘、机器人状态环形图",
        )
        == "freeform"
    )


def test_tier_override_scene():
    profile = {
        "provider": "ollama",
        "model_name": "qwen2.5:7b",
        "extra_config": {"dashboard_tier": "scene"},
    }
    assert detect_dashboard_tier(profile, message="随便") == "scene"


def test_tier_label_scene():
    assert "Three" in tier_label("scene") or "场景" in tier_label("scene")


def test_inject_pixi_and_three_review():
    data = _normalize_scene_data(None, "精致数字孪生大屏")
    assert data.get("engine") == "pixi"
    html = inject_scene_html(data)
    assert "pixi" in html.lower()
    ok, reason = review_scene_html(html)
    assert ok, reason

    data3 = _normalize_scene_data({"engine": "three"}, "用 Three.js 真正的 3D")
    assert pick_scene_engine("用 Three.js 真正的 3D", data3) == "three"
    html3 = inject_scene_html({**data3, "engine": "three"})
    ok3, reason3 = review_scene_html(html3)
    assert ok3, reason3


def test_inject_and_review_scaffold():
    data = _normalize_scene_data(None, "AMR 3D")
    html = inject_scene_html(data)
    assert "__SIDEA_SCENE__" in html
    assert "AMR" in html or "robots" in html
    ok, reason = review_scene_html(html)
    assert ok, reason


def test_default_scene_has_fault_robot():
    data = _default_scene_data("x")
    robots = data["robots"]
    assert any(r.get("status") == "fault" for r in robots)
