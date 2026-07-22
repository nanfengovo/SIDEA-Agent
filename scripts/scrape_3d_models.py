import os
import sys
import sqlite3
import uuid
import json
import urllib.request
import argparse

# Config
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'models')

# A simulated "open source index" of CC0 / Open Source 3D models from Three.js examples and other known repos
OPEN_SOURCE_INDEX = [
    {
        "name": "Industrial AGV (LittlestTokyo proxy)",
        "keywords": ["agv", "amr", "robot", "transport"],
        "url": "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/LittlestTokyo.glb"
    },
    {
        "name": "Robotic Arm (Expressive)",
        "keywords": ["robotic arm", "cobot", "robot", "arm"],
        "url": "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
    },
    {
        "name": "Factory Equipment (Gearbox)",
        "keywords": ["factory", "equipment", "gear", "machine"],
        "url": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/GearboxAssy/glTF-Binary/GearboxAssy.glb"
    },
    {
        "name": "Transport Drone",
        "keywords": ["drone", "agv", "transport", "air"],
        "url": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/FlightHelmet/glTF-Binary/FlightHelmet.glb" # Proxy for high detail
    },
    {
        "name": "Cybernetic Rover",
        "keywords": ["rover", "agv", "amr", "vehicle"],
        "url": "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Buggy/glTF-Binary/Buggy.glb"
    }
]

def download_model(url, save_path):
    print(f"Downloading {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SIDEA-Agent-Scraper/1.0'})
    with urllib.request.urlopen(req) as response, open(save_path, 'wb') as out_file:
        data = response.read()
        out_file.write(data)
    print(f"Saved to {save_path} ({len(data)} bytes)")

def scrape_models(keyword=""):
    os.makedirs(MODELS_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    kw_lower = keyword.lower()
    
    downloaded_count = 0
    for model in OPEN_SOURCE_INDEX:
        # Match keyword if provided
        if kw_lower:
            match = any(kw_lower in tag for tag in model['keywords']) or kw_lower in model['name'].lower()
            if not match:
                continue
                
        # Deduplication check
        c.execute("SELECT id FROM agent_3d_models WHERE name = ?", (model['name'],))
        if c.fetchone():
            print(f"Skipping {model['name']} (already exists)")
            continue
                
        # Generate unique ID and filename
        model_id = f"model_{uuid.uuid4().hex[:8]}"
        filename = f"{model_id}.glb"
        save_path = os.path.join(MODELS_DIR, filename)
        
        try:
            download_model(model['url'], save_path)
            # Insert to DB
            c.execute(
                "INSERT INTO agent_3d_models (id, name, keyword, file_path) VALUES (?, ?, ?, ?)",
                (model_id, model['name'], ", ".join(model['keywords']), f"/models/{filename}")
            )
            downloaded_count += 1
        except Exception as e:
            print(f"Error downloading {model['name']}: {e}")
            
    conn.commit()
    conn.close()
    
    print(json.dumps({"status": "success", "downloaded": downloaded_count}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyword", type=str, default="", help="Keyword to search for")
    args = parser.parse_args()
    
    scrape_models(args.keyword)
