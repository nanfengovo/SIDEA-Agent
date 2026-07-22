import sqlite3
import json
import random
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_templates (
            template_id    TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            category       TEXT NOT NULL,
            description    TEXT DEFAULT '',
            layout_config  TEXT NOT NULL DEFAULT '{}',
            is_enabled     INTEGER NOT NULL DEFAULT 1,
            created_at     TEXT DEFAULT (datetime('now','localtime')),
            updated_at     TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    conn.commit()
    return conn

# Core Design System configurations
THEMES = [
    {
        "category": "Cyberpunk 赛博朋克",
        "bg_css": "radial-gradient(circle at 50% 50%, #1a0b2e 0%, #05010f 100%)",
        "frame_css": "background: rgba(20, 10, 40, 0.6); border: 1px solid #ff00ff; box-shadow: 0 0 15px rgba(255, 0, 255, 0.3) inset;",
        "header_css": "background: linear-gradient(90deg, transparent, rgba(255,0,255,0.4), transparent); border-bottom: 2px solid #00ffff; text-shadow: 0 0 10px #00ffff;",
        "colors": ["#00ffff", "#ff00ff", "#facc15", "#ffffff"]
    },
    {
        "category": "Deep Ocean 深海幻影",
        "bg_css": "linear-gradient(180deg, #02111d 0%, #001a33 50%, #000c18 100%)",
        "frame_css": "background: rgba(0, 40, 80, 0.4); backdrop-filter: blur(8px); border: 1px solid rgba(0, 200, 255, 0.3); border-top: 2px solid #00c8ff;",
        "header_css": "background: rgba(0,20,40,0.8); border-bottom: 1px solid #005588; box-shadow: 0 4px 20px rgba(0,200,255,0.2);",
        "colors": ["#00c8ff", "#00ffaa", "#e2e8f0", "#94a3b8"]
    },
    {
        "category": "Industrial Heavy 工业重装",
        "bg_css": "repeating-linear-gradient(45deg, #111 0, #111 2px, #1a1a1a 2px, #1a1a1a 4px)",
        "frame_css": "background: #222222; border: 2px solid #444; border-left: 4px solid #f59e0b; border-radius: 4px;",
        "header_css": "background: #111; border-bottom: 4px solid #f59e0b; color: #f59e0b; font-weight: 900; letter-spacing: 0.2em;",
        "colors": ["#f59e0b", "#ef4444", "#a3a3a3", "#ffffff"]
    },
    {
        "category": "Holographic 全息投影",
        "bg_css": "radial-gradient(ellipse at center, #001e1e 0%, #000000 100%)",
        "frame_css": "background: transparent; border: 1px solid rgba(0, 255, 200, 0.2); box-shadow: 0 0 20px rgba(0,255,200,0.1) inset; border-radius: 8px;",
        "header_css": "background: transparent; text-shadow: 0 0 15px #00ffcc, 0 0 30px #00ffcc;",
        "colors": ["#00ffcc", "#ffffff", "#0088ff", "#00ffcc"]
    },
    {
        "category": "Glassmorphism 毛玻璃",
        "bg_css": "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        "frame_css": "background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;",
        "header_css": "background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.05);",
        "colors": ["#818cf8", "#c084fc", "#f8fafc", "#cbd5e1"]
    }
]

MODIFIERS = [
    ("Alpha", "2x2"), ("Beta", "twin_center"), ("Gamma", "3x3"), 
    ("Delta", "1_center_2_sides"), ("Epsilon", "2x2"), ("Zeta", "twin_center"),
    ("Omega", "3x3"), ("Sigma", "1_center_2_sides"), ("Nexus", "2x2"), ("Prime", "twin_center")
]

def generate_templates():
    conn = init_db()
    cursor = conn.cursor()
    
    # Optional: Clear old templates or just insert new ones
    cursor.execute("DELETE FROM dashboard_templates WHERE template_id LIKE 'gen_%'")
    
    count = 1
    for theme in THEMES:
        for mod_name, layout in MODIFIERS:
            template_id = f"gen_{theme['category'].split(' ')[0].lower()}_{mod_name.lower()}"
            name = f"{theme['category'].split(' ')[1]} - {mod_name} 版本"
            
            # Slightly randomize colors to create uniqueness
            colors = theme["colors"].copy()
            if count % 2 == 0:
                colors.reverse()
                
            layout_config = {
                "layout": layout,
                "bg_css": theme["bg_css"],
                "frame_css": theme["frame_css"],
                "header_css": theme["header_css"],
                "colors": colors,
                "version": "2.0"
            }
            
            cursor.execute("""
                INSERT OR REPLACE INTO dashboard_templates (template_id, name, category, description, layout_config)
                VALUES (?, ?, ?, ?, ?)
            """, (template_id, name, theme["category"], f"自动生成的高级大屏模版: {name}", json.dumps(layout_config, ensure_ascii=False)))
            
            count += 1
            
    conn.commit()
    print(f"✅ Successfully generated and inserted {count - 1} premium dashboard templates into config.db")
    
if __name__ == "__main__":
    generate_templates()
