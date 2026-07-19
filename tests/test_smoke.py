"""Smoke tests for SIDEA v0.1.0 release readiness."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_health_endpoint():
    from fastapi.testclient import TestClient
    from api.app import create_app

    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "sidea-agent"


def test_public_url_helper(monkeypatch):
    from core.public_url import get_public_base_url, public_url

    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.test")
    assert get_public_base_url() == "https://example.test"
    assert public_url("sandbox_workspace/a.json") == "https://example.test/sandbox_workspace/a.json"


def test_rcs_capability_catalog():
    from integrations.rcs.capabilities import capability_catalog

    caps = capability_catalog()
    ids = {c["id"] for c in caps}
    assert len(ids) == 10
    assert "task.list" in ids
    assert "agv.status" in ids
    assert "map.snapshot" in ids


def test_nxp_seed_idempotent():
    from integrations.rcs import ensure_rcs_schema, seed_nxp_erack_profile, list_profiles, list_bindings

    with tempfile.TemporaryDirectory() as td:
        db = str(Path(td) / "cfg.db")
        # Ensure base tables exist for foreign keys if needed
        from infra.database import init_db

        init_db(db)
        ensure_rcs_schema(db)
        first = seed_nxp_erack_profile(db)
        second = seed_nxp_erack_profile(db)
        assert first.get("seeded") is True
        assert second.get("seeded") is False
        profiles = list_profiles(db)
        assert any(p.get("profile_id") == "nxp_tw_erack" for p in profiles)
        active = next(p for p in profiles if p.get("is_active"))
        bindings = list_bindings(active["profile_id"], db)
        assert len(bindings) == 10


def test_freeform_empty_hero_fallback():
    from agent.goal_pipeline import _normalize_freeform_dashboard

    raw = {
        "type": "dashboard",
        "title": "RCS AMR 任务执行监控大屏",
        "title_en": "RCS AMR Dashboard",
        "layout": "3x3",
        "panels": [
            {
                "id": "p0",
                "title": "AMR 仿真地图",
                "title_en": "AMR Map",
                "span": {"col": 2, "row": 2},
                "option": {"xAxis": {}, "yAxis": {}, "series": [{"type": "scatter", "data": []}]},
            },
            {
                "id": "p1",
                "title": "任务效率",
                "title_en": "Task Efficiency",
                "option": {
                    "xAxis": {"data": ["a", "b"]},
                    "yAxis": {},
                    "series": [{"type": "bar", "data": [1, 2]}],
                },
            },
            {
                "id": "p2",
                "title": "状态分布",
                "title_en": "Status",
                "option": {"series": [{"type": "pie", "data": [{"name": "idle", "value": 3}]}]},
            },
        ],
        "insights": ["观察1"],
    }
    out = _normalize_freeform_dashboard(raw, "RCS AMR 任务执行大屏")
    assert out is not None
    ids = [p["id"] for p in out["panels"]]
    assert "p0" not in ids
    assert ids[0] == "p_hero"
    assert out["panels"][0]["span"] == {"col": 2, "row": 2}


def test_demo_amr_deterministic(tmp_path):
    from scripts.demo_amr import build_demo_dashboard

    a = build_demo_dashboard(seed=42)
    b = build_demo_dashboard(seed=42)
    assert a == b
    assert a["type"] == "dashboard"
    assert len(a["panels"]) >= 4
    assert a["_meta"]["data_source"] == "simulated"


def test_demo_script_writes_file(tmp_path):
    out = tmp_path / "demo.json"
    import subprocess
    import sys

    subprocess.check_call(
        [sys.executable, str(ROOT / "scripts" / "demo_amr.py"), "--out", str(out), "--seed", "42"],
        cwd=str(ROOT),
    )
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["type"] == "dashboard"
    assert payload.get("insights")
