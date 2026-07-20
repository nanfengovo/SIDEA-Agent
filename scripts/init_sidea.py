#!/usr/bin/env python3
"""初始化 SIDEA 数据库并同步大屏模板目录"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from infra.database import init_db, seed_default_data
from dashboard.template_manager import sync_catalog_to_db, get_template_stats


def main():
    init_db()
    seed_default_data()
    count = sync_catalog_to_db()
    stats = get_template_stats()
    print(f"✅ 数据库初始化完成")
    print(f"✅ 已同步 {count} 个大屏模板")
    print(f"   总数: {stats['total']} | 3D: {stats['count_3d']} | 可本地渲染: {stats['count_native_renderable']}")
    print(f"   风格: {stats['by_style']}")


if __name__ == "__main__":
    main()
