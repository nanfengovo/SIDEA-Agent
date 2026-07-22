import os
import sqlite3
import json

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config.db')

TEMPLATES_RECIPES = {
    'tpl_ext_amhs_8e279b': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(135deg, #0a0e27 0%, #1a1040 50%, #0d1117 100%)',
        'frame_css': 'border-color: #a855f7; box-shadow: 0 0 15px rgba(168,85,247,0.3), inset 0 0 15px rgba(168,85,247,0.1)',
        'header_css': 'color: #e9d5ff; text-shadow: 0 0 20px rgba(168,85,247,0.8); border-bottom: 2px solid #a855f7',
        'accent_color': '#a855f7',
        'kpi_bg': 'rgba(168,85,247,0.15)',
        'kpi_border': 'rgba(168,85,247,0.3)',
        'chart_colors': ['#a855f7', '#c084fc', '#e9d5ff', '#f59e0b', '#fbbf24'],
    },
    'tpl_custom_agv_977581': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(180deg, #020617 0%, #0c1a3a 40%, #0f172a 100%)',
        'frame_css': 'border-color: #06b6d4; box-shadow: 0 0 12px rgba(6,182,212,0.35), inset 0 0 12px rgba(6,182,212,0.08)',
        'header_css': 'color: #a5f3fc; text-shadow: 0 0 18px rgba(6,182,212,0.9); border-bottom: 2px solid #06b6d4',
        'accent_color': '#06b6d4',
        'kpi_bg': 'rgba(6,182,212,0.12)',
        'kpi_border': 'rgba(6,182,212,0.3)',
        'chart_colors': ['#06b6d4', '#22d3ee', '#67e8f9', '#10b981', '#34d399'],
    },
    'tpl_ext_erack_4deab6': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(160deg, #021a0a 0%, #0a2e1a 50%, #071210 100%)',
        'frame_css': 'border-color: #10b981; box-shadow: 0 0 14px rgba(16,185,129,0.3), inset 0 0 10px rgba(16,185,129,0.08)',
        'header_css': 'color: #a7f3d0; text-shadow: 0 0 16px rgba(16,185,129,0.85); border-bottom: 2px solid #10b981',
        'accent_color': '#10b981',
        'kpi_bg': 'rgba(16,185,129,0.12)',
        'kpi_border': 'rgba(16,185,129,0.3)',
        'chart_colors': ['#10b981', '#34d399', '#6ee7b7', '#06b6d4', '#22d3ee'],
    },
    'tpl_cockpit_ceo_1': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(135deg, #1a1000 0%, #2d1f0a 40%, #0f0d08 100%)',
        'frame_css': 'border-color: #f59e0b; box-shadow: 0 0 14px rgba(245,158,11,0.25), inset 0 0 10px rgba(245,158,11,0.06)',
        'header_css': 'color: #fef3c7; text-shadow: 0 0 18px rgba(245,158,11,0.8); border-bottom: 2px solid #f59e0b',
        'accent_color': '#f59e0b',
        'kpi_bg': 'rgba(245,158,11,0.12)',
        'kpi_border': 'rgba(245,158,11,0.3)',
        'chart_colors': ['#f59e0b', '#fbbf24', '#fde68a', '#ef4444', '#f87171'],
    },
    'tpl_custom_chassis_57f363': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(135deg, #18120a 0%, #261a0c 50%, #111111 100%)',
        'frame_css': 'border-color: #f97316; box-shadow: 0 0 12px rgba(249,115,22,0.3), inset 0 0 10px rgba(249,115,22,0.06)',
        'header_css': 'color: #fed7aa; text-shadow: 0 0 16px rgba(249,115,22,0.8); border-bottom: 2px solid #f97316',
        'accent_color': '#f97316',
        'kpi_bg': 'rgba(249,115,22,0.12)',
        'kpi_border': 'rgba(249,115,22,0.3)',
        'chart_colors': ['#f97316', '#fb923c', '#fdba74', '#ef4444', '#fbbf24'],
    },
    'tpl_custom_general_102de1': {
        'layout': 'twin_center',
        'bg_css': 'linear-gradient(135deg, #0b1220 0%, #111827 50%, #0f172a 100%)',
        'frame_css': 'border-color: #22d3ee; box-shadow: 0 0 12px rgba(34,211,238,0.25), inset 0 0 10px rgba(34,211,238,0.08)',
        'header_css': 'color: #cffafe; text-shadow: 0 0 16px rgba(34,211,238,0.8); border-bottom: 2px solid #22d3ee',
        'accent_color': '#22d3ee',
        'kpi_bg': 'rgba(34,211,238,0.12)',
        'kpi_border': 'rgba(34,211,238,0.3)',
        'chart_colors': ['#22d3ee', '#06b6d4', '#67e8f9', '#a855f7', '#10b981'],
    },
}

def seed_visual_recipes():
    print(f"Connecting to database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for template_id, recipe in TEMPLATES_RECIPES.items():
        cursor.execute("SELECT layout_config FROM dashboard_templates WHERE template_id = ?", (template_id,))
        row = cursor.fetchone()

        if row is None:
            print(f"[SKIP] Template {template_id} not found in database.")
            continue

        raw_config = row[0]
        config = json.loads(raw_config) if raw_config else {}

        # Merge visual recipe into existing config
        config.update(recipe)

        updated_json = json.dumps(config, ensure_ascii=False)
        cursor.execute(
            "UPDATE dashboard_templates SET layout_config = ? WHERE template_id = ?",
            (updated_json, template_id)
        )
        print(f"[SUCCESS] Updated template: {template_id} with visual recipe.")

    conn.commit()
    conn.close()
    print("All updates committed successfully.")

if __name__ == '__main__':
    seed_visual_recipes()
