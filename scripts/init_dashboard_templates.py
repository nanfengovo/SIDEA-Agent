#!/usr/bin/env python3
"""初始化数据库并同步大屏看板模板"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from infra.database import init_db, seed_default_config, seed_default_skills
from dashboard.seed import seed_all
from dashboard.store import get_stats


def main():
    init_db("config.db")
    seed_default_config("config.db")
    seed_default_skills("config.db")
    try:
        from integrations.rcs import ensure_rcs_schema, seed_nxp_erack_profile
        ensure_rcs_schema("config.db")
        seed_nxp_erack_profile("config.db")
    except Exception as e:
        print(f"[skip] RCS: {e}")
    try:
        from integrations.llm import ensure_llm_schema, seed_default_llm_profiles
        ensure_llm_schema("config.db")
        seed_default_llm_profiles("config.db")
    except Exception as e:
        print(f"[skip] LLM: {e}")
    result = seed_all()
    stats = get_stats()
    print(f"✅ 大屏模板同步完成: 内置 {result['builtin']} + 目录 {result['catalog']}")
    print(f"   总计 {stats['total']} 个 | 3D: {stats['count_3d']} | 分类: {stats['by_category']}")


if __name__ == "__main__":
    main()
