"""大屏看板种子数据"""
from __future__ import annotations

import json
from pathlib import Path

from dashboard.store import create_template, get_template, list_categories
from infra.database import get_connection

DB = "config.db"
TEMPLATES_DIR = Path(__file__).parent / "templates_json"


def seed_categories():
    cats = [
        ("digital_twin", "数字孪生", "3D 立体库/工厂孪生可视化", "box", 1),
        ("cockpit", "管理驾驶舱", "CXO/管理层决策看板", "gauge", 2),
        ("rcs_monitor", "RCS 监控", "AMR/任务/自动化率监控", "activity", 3),
        ("warehouse", "智能仓储", "立库/Erack/WMS 可视化", "warehouse", 4),
        ("logistics", "物流调度", "AGV/路径/运输调度", "truck", 5),
        ("industrial", "工业监控", "产线/设备/MES 看板", "factory", 6),
        ("general", "通用大屏", "通用数据可视化模板库", "layout", 99),
    ]
    with get_connection(DB) as conn:
        for cid, name, desc, icon, order in cats:
            conn.execute(
                """
                INSERT OR IGNORE INTO dashboard_categories
                (category_id, name, description, icon, sort_order)
                VALUES (?,?,?,?,?)
                """,
                (cid, name, desc, icon, order),
            )
        conn.commit()


def _load_json(name: str) -> dict:
    path = TEMPLATES_DIR / name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def seed_builtin_templates():
    """内置可预览 JSON 模板"""
    builtins = [
        {
            "template_id": "amr-command-center",
            "aliases": ["amr command center", "AMR Command Center"],
            "category_id": "rcs_monitor",
            "name": "AMR 任务执行监控中心",
            "description": "AMR 厂区仿真地图 + 自动化率 + 机器人状态 + 3D 库区",
            "style": "tech-blue",
            "scene": "rcs",
            "template_type": "json_dashboard",
            "has_3d": True,
            "priority": 100,
            "tags": ["AMR", "RCS", "自动化率", "3D"],
            "json_file": "amr_command_center.json",
        },
        {
            "template_id": "twin-center",
            "aliases": ["twin center", "Twin Center", "数字孪生中心"],
            "category_id": "digital_twin",
            "name": "数字孪生监控中心",
            "description": "车间数字孪生 + 核心温度阵列 + 产能缺陷追踪",
            "style": "holographic",
            "scene": "factory",
            "template_type": "json_dashboard",
            "has_3d": True,
            "priority": 99,
            "tags": ["数字孪生", "3D", "工厂"],
            "json_file": "twin_center.json",
        },
        {
            "template_id": "stereo-warehouse",
            "aliases": ["立体库全景", "stereo warehouse"],
            "category_id": "warehouse",
            "name": "立体库全景",
            "description": "3D 立体库主视图 + 吞吐趋势 + 区域负载 + 设备状态",
            "style": "cyberpunk",
            "scene": "warehouse",
            "template_type": "json_dashboard",
            "has_3d": True,
            "priority": 98,
            "tags": ["立体库", "Erack", "WMS", "3D"],
            "json_file": "stereo_warehouse.json",
        },
        {
            "template_id": "automation-cockpit",
            "aliases": ["自动化驾驶舱"],
            "category_id": "cockpit",
            "name": "自动化率综合驾驶舱",
            "description": "综合自动化率 KPI + 7日趋势 + 告警 TopN",
            "style": "dark-gold",
            "scene": "cockpit",
            "template_type": "json_dashboard",
            "has_3d": False,
            "priority": 90,
            "tags": ["自动化率", "驾驶舱", "KPI"],
            "json_file": "automation_cockpit.json",
        },
    ]

    # 若 sandbox 有 demo，复制为 amr 模板
    demo_path = Path(__file__).parent.parent / "sandbox_workspace" / "demo_amr_dashboard.json"
    if demo_path.exists() and not (TEMPLATES_DIR / "amr_command_center.json").exists():
        TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
        (TEMPLATES_DIR / "amr_command_center.json").write_text(
            demo_path.read_text(encoding="utf-8"), encoding="utf-8"
        )

    count = 0
    for spec in builtins:
        if get_template(spec["template_id"]):
            continue
        dashboard_json = _load_json(spec.pop("json_file"))
        if not dashboard_json:
            continue
        spec["dashboard_json"] = dashboard_json
        spec.setdefault("source_id", "sidea")
        create_template(spec)
        count += 1
    return count


def seed_catalog_metadata():
    """从 catalog 导入外链模板元数据（不含 JSON）"""
    catalog_path = Path(__file__).parent / "catalog" / "templates.json"
    if not catalog_path.exists():
        return 0
    items = json.loads(catalog_path.read_text(encoding="utf-8"))
    scene_to_cat = {
        "rcs": "rcs_monitor",
        "warehouse": "warehouse",
        "factory": "industrial",
        "logistics": "logistics",
        "cockpit": "cockpit",
        "energy": "industrial",
        "general": "general",
    }
    count = 0
    for tpl in items:
        tid = tpl["template_id"]
        if get_template(tid):
            continue
        create_template({
            "template_id": tid,
            "category_id": scene_to_cat.get(tpl.get("scene"), "general"),
            "name": tpl["name"],
            "description": f"来源: {tpl.get('source_id', '')}",
            "style": tpl.get("style", "tech-blue"),
            "scene": tpl.get("scene", "general"),
            "template_type": tpl.get("template_type", "html_static"),
            "has_3d": tpl.get("has_3d", False),
            "preview_url": tpl.get("preview_url"),
            "local_path": tpl.get("local_path"),
            "source_id": tpl.get("source_id", "external"),
            "recommended_for": tpl.get("recommended_for", []),
            "data_slots": tpl.get("data_slots", []),
            "tags": tpl.get("tags", []),
            "priority": tpl.get("priority", 50),
        })
        count += 1
    return count


def seed_all():
    seed_categories()
    n1 = seed_builtin_templates()
    n2 = seed_catalog_metadata()
    return {"builtin": n1, "catalog": n2, "categories": len(list_categories())}
