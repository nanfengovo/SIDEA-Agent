import sqlite3
import os
import json
import random
import sys

# Add parent dir to path so we can import infra
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
DB_PATH = "config.db"

def seed_v2():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Drop existing table to ensure schema is updated
    cursor.execute("DROP TABLE IF EXISTS dashboard_templates")
    
    # Recreate table with new schema
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dashboard_templates (
        template_id    TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        category       TEXT NOT NULL,
        description    TEXT DEFAULT '',
        style          TEXT DEFAULT '',
        scenario       TEXT DEFAULT '',
        has_3d         INTEGER NOT NULL DEFAULT 0,
        source         TEXT DEFAULT '',
        preview_url    TEXT DEFAULT '',
        layout_config  TEXT NOT NULL DEFAULT '{}',
        is_enabled     INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT DEFAULT (datetime('now','localtime')),
        updated_at     TEXT DEFAULT (datetime('now','localtime'))
    );
    """)

    # Data dictionaries
    styles = ["科技蓝", "赛博朋克", "暗金", "工业", "全息", "矩阵绿", "告警红", "极简"]
    scenarios = ["RCS", "仓储", "工厂", "物流", "驾驶舱", "能源", "通用"]
    sources = ["BigDataView", "OneTwin", "Meteor3D", "TvT.js", "GoView", "DataRoom", "MES", "DataEase", "OpenWCS", "Digital-twin", "SIDEA原生"]

    templates_data = []

    # 1. 6 templates with 3D digital twin
    twin_sources = ["OneTwin", "Meteor3D", "OpenWCS", "SIDEA原生", "TvT.js", "Digital-twin"]
    for i in range(6):
        source = twin_sources[i]
        scenario = "仓储" if "WCS" in source else "工厂"
        templates_data.append({
            "template_id": f"gen_3d_{i+1}_{source.lower()}",
            "name": f"{source} 3D 数字孪生指挥舱 v{i+1}",
            "category": "digital_twin",
            "description": f"由 {source} 引擎提供支持的全景 3D 数字孪生模板。支持数据槽位注入。",
            "style": random.choice(styles),
            "scenario": scenario,
            "has_3d": 1,
            "source": source,
            "preview_url": f"https://example.com/preview/{source.lower()}",
            "layout_config": json.dumps({
                "model_url": "https://example.com/models/factory.glb" if i % 2 == 0 else "/models/robot.glb",
                "bindings": ["automation_rate", "total_yield"]
            })
        })
        
    # Add explicit sidea-rcs-erack-3d-v1
    templates_data.append({
        "template_id": "sidea-rcs-erack-3d-v1",
        "name": "Erack 仓储货架数字孪生",
        "category": "digital_twin",
        "description": "SIDEA 原生提供。3D Erack 货架模型，库位状态着色（占用/空闲/异常），相机环绕动画。只需传入 erack_status_map。",
        "style": "科技蓝",
        "scenario": "RCS",
        "has_3d": 1,
        "source": "SIDEA原生",
        "preview_url": "https://example.com/preview/erack",
        "layout_config": json.dumps({"widget": "Amr3DMapWidget"})
    })
    
    # Generate remaining templates to reach 67
    for i in range(len(templates_data), 67):
        style = random.choice(styles)
        scenario = random.choice(scenarios)
        source = random.choice(sources)
        templates_data.append({
            "template_id": f"tpl_{source.lower()}_{i}",
            "name": f"{scenario}场景{style}仪表盘",
            "category": "dashboard",
            "description": f"基于 {source} 的{style}风格{scenario}大屏模板。适合高管驾驶舱展示。",
            "style": style,
            "scenario": scenario,
            "has_3d": 0,
            "source": source,
            "preview_url": f"https://example.com/preview/tpl_{i}",
            "layout_config": json.dumps({"layout": "grid"})
        })

    # Insert into DB
    for tpl in templates_data:
        cursor.execute("""
            INSERT INTO dashboard_templates 
            (template_id, name, category, description, style, scenario, has_3d, source, preview_url, layout_config, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tpl["template_id"], tpl["name"], tpl["category"], tpl["description"],
            tpl["style"], tpl["scenario"], tpl["has_3d"], tpl["source"],
            tpl["preview_url"], tpl["layout_config"], 1
        ))

    conn.commit()
    conn.close()
    print(f"✅ 成功重置并注入了 {len(templates_data)} 套大屏可视化模板！")

if __name__ == "__main__":
    seed_v2()
