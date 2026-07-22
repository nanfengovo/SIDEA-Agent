#!/usr/bin/env python3
"""Emit a native Dashboard DSL v2 sample (widget + data, no ECharts options).

Usage:
  python scripts/demo_dsl_v2.py
  python scripts/demo_dsl_v2.py --out sandbox_workspace/demo_dsl_v2.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    from agent.dashboard_dsl import sample_amr_command_center, validate_dsl

    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="sandbox_workspace/demo_dsl_v2.json")
    args = parser.parse_args()

    doc = sample_amr_command_center()
    ok, reason = validate_dsl(doc)
    if not ok:
        print(f"[dsl] invalid: {reason}", file=sys.stderr)
        return 1

    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    from core.public_url import public_url

    print(f"[dsl] wrote {out}")
    print(f"[dsl] widgets={[x['widget'] for x in doc['layout']]}")
    print("[dsl] open with:")
    print(f"```echarts-i18n\n{public_url('sandbox_workspace/' + out.name)}\n```")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
