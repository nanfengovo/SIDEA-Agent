import sqlite3
import json
import uuid
import datetime

def seed_custom():
    conn = sqlite3.connect('config.db')
    c = conn.cursor()
    
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    templates = [
        {
            "id": f"tpl_custom_agv_{uuid.uuid4().hex[:6]}",
            "name": "模板 A: AGV 调度数字孪生",
            "category": "operations",
            "style": "科技蓝",
            "scenario": "RCS监控",
            "has_3d": 1,
            "layout_config": json.dumps({
                "subcategory": "agv_twin",
                "tags": ["AGV", "3D Canvas", "Operations"]
            })
        },
        {
            "id": f"tpl_custom_plc_{uuid.uuid4().hex[:6]}",
            "name": "模板 B: PLC 通信与延迟监控",
            "category": "operations",
            "style": "极简白",
            "scenario": "网络监控",
            "has_3d": 0,
            "layout_config": json.dumps({
                "subcategory": "plc_topology",
                "tags": ["PLC", "Network", "Topology"]
            })
        },
        {
            "id": f"tpl_custom_chassis_{uuid.uuid4().hex[:6]}",
            "name": "模板 C: 设备单体透视监控",
            "category": "industry",
            "style": "暗金",
            "scenario": "设备诊断",
            "has_3d": 0,
            "layout_config": json.dumps({
                "subcategory": "chassis_monitor",
                "tags": ["Wireframe", "Logs", "Diagnostic"]
            })
        },
        {
            "id": f"tpl_custom_general_{uuid.uuid4().hex[:6]}",
            "name": "模板 D: 通用数据大盘",
            "category": "visualization",
            "style": "赛博朋克",
            "scenario": "综合看板",
            "has_3d": 0,
            "layout_config": json.dumps({
                "subcategory": "general_dashboard",
                "tags": ["Grid", "Modular", "General"]
            })
        }
    ]
    
    for t in templates:
        c.execute("""
            INSERT OR REPLACE INTO dashboard_templates 
            (template_id, name, category, description, style, scenario, has_3d, source, preview_url, layout_config, is_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            t["id"], t["name"], t["category"], "Auto-generated custom archetype", t["style"], t["scenario"], t["has_3d"],
            "System", "", t["layout_config"], 1, now, now
        ))
    
    conn.commit()
    conn.close()
    print("Successfully seeded 4 custom archetype templates.")

if __name__ == '__main__':
    seed_custom()
