from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
import sqlite3
import os
import subprocess
import json
import uuid
import shutil

router = APIRouter(prefix="/models3d", tags=["3D Models"])
DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'config.db')
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public')

try:
    import cascadio
    HAS_CASCADIO = True
except ImportError:
    HAS_CASCADIO = False

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@router.get("/")
def get_models():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agent_3d_models ORDER BY created_at DESC")
        models = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"models": models}
    except Exception as e:
        # Table might not exist yet if not initialized
        return {"models": []}

@router.post("/scrape")
def scrape_models(keyword: str = ""):
    script_path = os.path.join(SCRIPTS_DIR, "scrape_3d_models.py")
    try:
        # Run the python script
        result = subprocess.run(
            ["python3", script_path, "--keyword", keyword],
            capture_output=True, text=True, check=True
        )
        
        # Try to parse the json output from the script (last line)
        output_lines = result.stdout.strip().split('\n')
        status = {"status": "success", "downloaded": 0}
        for line in reversed(output_lines):
            try:
                status = json.loads(line)
                break
            except:
                continue
                
        return status
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{model_id}")
def delete_model(model_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM agent_3d_models WHERE id = ?", (model_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Model not found")
        
    file_path = row['file_path']
    # Delete from DB
    cursor.execute("DELETE FROM agent_3d_models WHERE id = ?", (model_id,))
    conn.commit()
    conn.close()
    
    # Delete from filesystem
    full_path = os.path.join(MODELS_DIR, file_path.lstrip('/'))
    if os.path.exists(full_path):
        os.remove(full_path)
        
    return {"status": "success", "deleted": model_id}

@router.post("/upload")
async def upload_model(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.glb', '.gltf', '.stp', '.step')):
        raise HTTPException(status_code=400, detail="Only .glb, .gltf, .stp, .step files are allowed")
        
    model_id = f"model_{uuid.uuid4().hex[:8]}"
    ext = os.path.splitext(file.filename)[1].lower()
    
    save_dir = os.path.join(MODELS_DIR, 'models')
    raw_dir = os.path.join(MODELS_DIR, 'models', 'raw')
    os.makedirs(save_dir, exist_ok=True)
    os.makedirs(raw_dir, exist_ok=True)
    
    conn = get_db()
    cursor = conn.cursor()
    
    if ext in ['.stp', '.step']:
        if not HAS_CASCADIO:
            raise HTTPException(status_code=500, detail="cascadio package is not installed. Cannot parse STP files.")
            
        stp_filename = f"{model_id}{ext}"
        stp_path = os.path.join(raw_dir, stp_filename)
        
        # Save original STP
        with open(stp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Convert to GLB
        glb_filename = f"{model_id}.glb"
        glb_path = os.path.join(save_dir, glb_filename)
        try:
            cascadio.step_to_glb(stp_path, glb_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to convert STP to GLB: {e}")
            
        cursor.execute(
            "INSERT INTO agent_3d_models (id, name, keyword, file_path, original_file_path) VALUES (?, ?, ?, ?, ?)",
            (model_id, file.filename, "uploaded, stp, converted", f"/models/{glb_filename}", f"/models/raw/{stp_filename}")
        )
        file_path_resp = f"/models/{glb_filename}"
    else:
        filename = f"{model_id}{ext}"
        save_path = os.path.join(save_dir, filename)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Check if original_file_path column exists to avoid error if db isn't updated
        cursor.execute("PRAGMA table_info(agent_3d_models)")
        cols = [col['name'] for col in cursor.fetchall()]
        if 'original_file_path' in cols:
            cursor.execute(
                "INSERT INTO agent_3d_models (id, name, keyword, file_path, original_file_path) VALUES (?, ?, ?, ?, ?)",
                (model_id, file.filename, "uploaded, custom", f"/models/{filename}", None)
            )
        else:
            cursor.execute(
                "INSERT INTO agent_3d_models (id, name, keyword, file_path) VALUES (?, ?, ?, ?)",
                (model_id, file.filename, "uploaded, custom", f"/models/{filename}")
            )
        file_path_resp = f"/models/{filename}"
        
    conn.commit()
    conn.close()
    
    return {"status": "success", "model_id": model_id, "file_path": file_path_resp}

@router.get("/download/{model_id}")
def download_model(model_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(agent_3d_models)")
    cols = [col['name'] for col in cursor.fetchall()]
    
    if 'original_file_path' in cols:
        cursor.execute("SELECT file_path, original_file_path, name FROM agent_3d_models WHERE id = ?", (model_id,))
    else:
        cursor.execute("SELECT file_path, name FROM agent_3d_models WHERE id = ?", (model_id,))
        
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
        
    original_path = row['original_file_path'] if 'original_file_path' in row.keys() else None
    
    if original_path:
        full_path = os.path.join(MODELS_DIR, original_path.lstrip('/'))
    else:
        full_path = os.path.join(MODELS_DIR, row['file_path'].lstrip('/'))
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(full_path, filename=row['name'])

@router.post("/use/{model_id}")
def use_model(model_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM agent_3d_models WHERE id = ?", (model_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Model not found")
        
    file_path = row['file_path']
    
    # Update sys_config
    cursor.execute("SELECT 1 FROM sys_config WHERE config_key = 'active_3d_model_path'")
    if cursor.fetchone():
        cursor.execute("UPDATE sys_config SET config_value = ?, updated_at = datetime('now','localtime') WHERE config_key = 'active_3d_model_path'", (file_path,))
    else:
        cursor.execute("INSERT INTO sys_config (config_key, config_value, category, description) VALUES ('active_3d_model_path', ?, 'general', 'Active 3D model used in Dashboard')", (file_path,))
        
    conn.commit()
    conn.close()
    
    return {"status": "success", "active_model": file_path}

@router.get("/active")
def get_active_model():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_value FROM sys_config WHERE config_key = 'active_3d_model_path'")
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {"active_model": row['config_value']}
    
    # Default model if none configured
    return {"active_model": "/models/robot.glb"}
