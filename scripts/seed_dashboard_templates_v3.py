import sys
import os
import json
import sqlite3

# Add the project root to the system path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from infra.database import get_connection

def generate_templates():
    templates = []
    
    styles = ['科技蓝', '赛博朋克', '暗金', '工业橙', '全息投影', '矩阵绿', '告警红', '极简白']
    sources = ['BigDataView', 'iDataV', 'GoView模板市场', 'DataEase模板市场', 'EasyV公开案例', 'ThingJS案例库', 'SIDEA原生', 'DataV社区']
    
    def add_batch(category, base_scenario, count, prefix, has_3d=0, chart_types=None):
        for i in range(1, count + 1):
            name = f"{base_scenario}主题大屏 - 样式{i}"
            template_id = f"tpl_{category}_{prefix}_{i}"
            style = styles[(len(templates) + i) % len(styles)]
            source = sources[(len(templates) + i) % len(sources)]
            layout_config = {
                "layout": "standard" if i % 2 == 0 else "grid",
                "subcategory": base_scenario,
                "tags": [category, base_scenario, style],
                "complexity": "high" if i % 3 == 0 else "medium" if i % 2 == 0 else "low",
                "kpi_count": (i % 4) + 3,
                "chart_types": chart_types or ["line", "bar", "pie"]
            }
            templates.append({
                "template_id": template_id,
                "name": name,
                "category": category,
                "description": f"专为{base_scenario}场景打造的数据可视化模板，采用{style}设计风格，具备极强的数据表现力。",
                "style": style,
                "scenario": base_scenario,
                "has_3d": has_3d,
                "source": source,
                "preview_url": f"https://mock.preview/{template_id}.png",
                "layout_config": json.dumps(layout_config, ensure_ascii=False),
                "is_enabled": 1
            })

    # 1. Digital Twin - 20 templates
    add_batch('digital_twin', '智慧工厂', 6, 'smart_factory', 1, ['3d_map', 'line', 'bar', 'gauge'])
    add_batch('digital_twin', '仓储物流', 5, 'logistics', 1, ['3d_map', 'scatter', 'pie', 'bar'])
    add_batch('digital_twin', '城市大脑', 4, 'city_brain', 1, ['3d_map', 'heatmap', 'line', 'radar'])
    add_batch('digital_twin', '智慧园区', 3, 'smart_park', 1, ['3d_map', 'bar', 'gauge', 'pie'])
    add_batch('digital_twin', '能源管网', 2, 'energy_grid', 1, ['3d_map', 'line', 'radar', 'sankey'])

    # 2. Cockpit - 18 templates
    add_batch('cockpit', 'CEO驾驶舱', 4, 'ceo', 0, ['pie', 'line', 'bar', 'kpi'])
    add_batch('cockpit', 'CXO综合', 4, 'cxo', 0, ['radar', 'line', 'bar', 'kpi'])
    add_batch('cockpit', '销售驾驶舱', 3, 'sales', 0, ['bar', 'line', 'map', 'funnel'])
    add_batch('cockpit', '运营驾驶舱', 4, 'operations', 0, ['line', 'funnel', 'bar', 'scatter'])
    add_batch('cockpit', '财务驾驶舱', 3, 'finance', 0, ['waterfall', 'bar', 'pie', 'line'])

    # 3. Operations - 16 templates
    add_batch('operations', 'RCS监控', 5, 'rcs_amr', 0, ['scatter', 'line', 'gauge', 'bar'])
    add_batch('operations', '设备状态', 4, 'device_status', 0, ['gauge', 'line', 'bar', 'pie'])
    add_batch('operations', '告警指挥', 4, 'alarm', 0, ['heatmap', 'scatter', 'line', 'bar'])
    add_batch('operations', '物流运营', 3, 'logistics_ops', 0, ['map', 'bar', 'line', 'sankey'])

    # 4. Industry - 20 templates
    add_batch('industry', '工厂生产', 5, 'manufacturing', 0, ['line', 'bar', 'pie', 'gauge'])
    add_batch('industry', '物流供应链', 4, 'supply_chain', 0, ['sankey', 'bar', 'line', 'map'])
    add_batch('industry', '能源电力', 4, 'power', 0, ['line', 'gauge', 'bar', 'heatmap'])
    add_batch('industry', '医疗健康', 4, 'medical', 0, ['bar', 'line', 'radar', 'pie'])
    add_batch('industry', '金融风控', 3, 'finance_risk', 0, ['scatter', 'line', 'funnel', 'bar'])

    # 5. Smart Scene - 18 templates
    add_batch('smart_scene', '智慧城市', 5, 'smart_city', 1, ['map', 'bar', 'line', 'heatmap'])
    add_batch('smart_scene', '智慧园区', 4, 'smart_park_scene', 1, ['map', 'pie', 'line', 'bar'])
    add_batch('smart_scene', '楼宇管理', 3, 'building', 1, ['bar', 'line', 'gauge', 'pie'])
    add_batch('smart_scene', '交通枢纽', 3, 'transport', 1, ['map', 'scatter', 'line', 'bar'])
    add_batch('smart_scene', '智慧社区', 3, 'community', 1, ['pie', 'bar', 'line', 'radar'])

    # 6. Visualization - 14 templates
    add_batch('visualization', '展示大屏', 4, 'display', 0, ['wordcloud', 'bar', 'line', 'pie'])
    add_batch('visualization', '地理大屏', 4, 'geo', 0, ['map', 'scatter', 'bar', 'line'])
    add_batch('visualization', '流量拓扑', 3, 'traffic_topo', 0, ['graph', 'line', 'bar', 'pie'])
    add_batch('visualization', '汇报展厅', 3, 'showroom', 0, ['bar', 'pie', 'line', 'radar'])

    # 7. KPI Board - 14 templates
    add_batch('kpi_board', '日报看板', 4, 'daily', 0, ['kpi', 'bar', 'line', 'pie'])
    add_batch('kpi_board', '运营日报', 4, 'ops_daily', 0, ['kpi', 'line', 'pie', 'bar'])
    add_batch('kpi_board', '财务看板', 3, 'finance_board', 0, ['kpi', 'waterfall', 'bar', 'line'])
    add_batch('kpi_board', '销售日报', 3, 'sales_daily', 0, ['kpi', 'bar', 'line', 'funnel'])

    return templates

def seed_v3():
    try:
        templates = generate_templates()
        total_templates = len(templates)
        print(f"Generated {total_templates} templates in memory.")
        
        insert_sql = """
        INSERT OR REPLACE INTO dashboard_templates 
        (template_id, name, category, description, style, scenario, has_3d, source, preview_url, layout_config, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        with get_connection('config.db') as conn:
            cursor = conn.cursor()
            conn.execute('BEGIN TRANSACTION')
            
            count = 0
            for tpl in templates:
                cursor.execute(insert_sql, (
                    tpl['template_id'],
                    tpl['name'],
                    tpl['category'],
                    tpl['description'],
                    tpl['style'],
                    tpl['scenario'],
                    tpl['has_3d'],
                    tpl['source'],
                    tpl['preview_url'],
                    tpl['layout_config'],
                    tpl['is_enabled']
                ))
                count += 1
                if count % 20 == 0:
                    print(f"Inserted {count}/{total_templates} templates...")
                    
            conn.commit()
            print(f"Successfully seeded {count} templates to dashboard_templates table.")
        
    except Exception as e:
        print(f"Error seeding templates: {e}")

if __name__ == '__main__':
    seed_v3()
