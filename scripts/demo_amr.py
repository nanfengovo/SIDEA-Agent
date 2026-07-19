#!/usr/bin/env python3
"""Offline, deterministic AMR / RCS dashboard demo.

Usage:
  python scripts/demo_amr.py
  python scripts/demo_amr.py --out sandbox_workspace/demo_amr_dashboard.json

No LLM and no live RCS connection are required.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEMO_MESSAGE = (
    "以「RCS AMR 任务执行监控」为主题生成数字孪生风格大屏："
    "中央大幅厂区仿真地图（存储区/充电区/接驳区分区色块，10 台左右 AMR "
    "按忙碌/空闲/充电/故障着色并带动画，任务路径流动箭头）；"
    "一个 3D 库区负载图；稼动率+自动化率；今日任务完成数+效率%；机器人状态环形图。"
    "数据自行模拟，要有异常点。"
)


def build_demo_dashboard(seed: int = 42) -> dict:
    """Build a deterministic dashboard payload without calling an LLM."""
    from agent.goal_pipeline import _map_centric_layout_for, _build_amr_floor_option, simulate_all
    from tools.sidea_sdk_template import export_dashboard

    rng = random.Random(seed)
    layout = _map_centric_layout_for(DEMO_MESSAGE)
    layout["title"] = "RCS AMR 任务执行监控大屏"
    layout["title_en"] = "RCS AMR Mission Execution Dashboard"
    layout["panels"] = [
        {
            "id": "floor",
            "type": "amr_map",
            "title": "AMR 厂区实时仿真地图",
            "title_en": "AMR Live Floor Simulation",
        },
        {
            "id": "oee",
            "type": "combo",
            "title": "任务效率与自动化率",
            "title_en": "Task Efficiency & Automation",
        },
        {
            "id": "status",
            "type": "pie",
            "title": "机器人状态分布",
            "title_en": "Robot Status Distribution",
        },
        {
            "id": "load3d",
            "type": "bar3d",
            "title": "库区负载三维视图",
            "title_en": "Warehouse Load 3D",
            "x_size": 8,
            "y_size": 8,
        },
        {
            "id": "today",
            "type": "bar",
            "title": "今日任务执行统计",
            "title_en": "Today Mission Stats",
        },
    ]

    charts = simulate_all(layout, DEMO_MESSAGE)
    for i, panel in enumerate(layout["panels"]):
        if panel.get("type") == "amr_map":
            charts[i] = {
                "type": "raw",
                "title": panel["title"],
                "title_en": panel["title_en"],
                "id": panel["id"],
                "option": _build_amr_floor_option(rng, DEMO_MESSAGE),
            }
            break

    sandbox = ROOT / "sandbox_workspace"
    sandbox.mkdir(parents=True, exist_ok=True)
    tmp = sandbox / "_demo_chart_option.json"
    export_dashboard(
        layout["title"],
        charts,
        filename=str(tmp),
        title_en=layout.get("title_en"),
    )
    payload = json.loads(tmp.read_text(encoding="utf-8"))
    tmp.unlink(missing_ok=True)
    payload["insights"] = [
        "AMR-04 处于故障态，建议优先调度附近空闲车接替任务。",
        "库区 C 负载峰值超过 95%，出入库口存在排队风险。",
        "近 6 小时自动化率维持在 78%~86%，稼动率仍有提升空间。",
    ]
    payload["_meta"] = {
        "demo": True,
        "seed": seed,
        "data_source": "simulated",
        "tier": "template",
    }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a deterministic AMR dashboard demo")
    parser.add_argument(
        "--out",
        default="sandbox_workspace/demo_amr_dashboard.json",
        help="Output JSON path (relative to repo root or absolute)",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)

    payload = build_demo_dashboard(seed=args.seed)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    from core.public_url import public_url

    url = public_url(f"sandbox_workspace/{out.name}")
    print(f"[demo] wrote {out}")
    print(f"[demo] panels={len(payload.get('panels') or [])}")
    print("[demo] open in UI with echarts-i18n block:")
    print(f"```echarts-i18n\n{url}\n```")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
