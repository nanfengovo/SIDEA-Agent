import sqlite3
import datetime
import uuid

def pull_external_templates():
    conn = sqlite3.connect('config.db')
    c = conn.cursor()
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # 真实世界的开源/优质大屏资源映射
    external_templates = [
        {
            "id": f"tpl_ext_rcs_{uuid.uuid4().hex[:6]}",
            "name": "[开源接管] AJ-Report 调度大盘",
            "category": "operations",
            "style": "科技蓝",
            "scenario": "RCS监控",
            "has_3d": 0,
            "source": "Gitee/AJ-Report",
            "preview_url": "https://ajreport.bznx.net/", # 真实开源报表演示站 (示例)
            "layout_config": '{"tags": ["AJ-Report", "OpenSource", "AGV"]}'
        },
        {
            "id": f"tpl_ext_amhs_{uuid.uuid4().hex[:6]}",
            "name": "[开源接管] GoView 晶圆厂 AMHS",
            "category": "industry",
            "style": "全息投影",
            "scenario": "高速物料流转",
            "has_3d": 0,
            "source": "Gitee/GoView",
            "preview_url": "https://www.mtrun.vip/goview/", # GoView 演示站
            "layout_config": '{"tags": ["GoView", "AMHS", "Vue3"]}'
        },
        {
            "id": f"tpl_ext_erack_{uuid.uuid4().hex[:6]}",
            "name": "[开源接管] DataV 立体库位数字孪生",
            "category": "digital_twin",
            "style": "赛博朋克",
            "scenario": "库位管理",
            "has_3d": 1,
            "source": "GitHub/DataV",
            "preview_url": "http://datav.jiaminghi.com/demo/", # DataV 演示站
            "layout_config": '{"tags": ["DataV", "3D", "Erack"]}'
        },
        {
            "id": f"tpl_ext_mapf_{uuid.uuid4().hex[:6]}",
            "name": "[学术开源] MAPF 多智能体路径追踪",
            "category": "digital_twin",
            "style": "极简",
            "scenario": "AGV路径规划",
            "has_3d": 1,
            "source": "GitHub/MAPF",
            "preview_url": "https://movingai.com/benchmarks/mapf/index.html",
            "layout_config": '{"tags": ["MAPF", "Research", "Routing"]}'
        }
    ]
    
    for t in external_templates:
        c.execute("""
            INSERT OR REPLACE INTO dashboard_templates 
            (template_id, name, category, description, style, scenario, has_3d, source, preview_url, layout_config, is_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            t["id"], t["name"], t["category"], 
            f"来源于 {t['source']} 的外部真实可视化项目，通过微前端 iframe 接管", 
            t["style"], t["scenario"], t["has_3d"],
            t["source"], t["preview_url"], t["layout_config"], 1, now, now
        ))
        
    conn.commit()
    conn.close()
    print(f"Successfully pulled {len(external_templates)} external templates into the library.")

if __name__ == '__main__':
    pull_external_templates()
