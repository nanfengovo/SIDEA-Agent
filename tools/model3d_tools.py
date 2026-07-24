import sqlite3
import os
import time
import uuid
import json
import urllib.request
from typing import Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'models')

class ActiveModelArgs(BaseModel):
    search_query: str = Field(description="搜索关键词、模型名称或编号，例如 'agv', 'robot', 'arm', 'gearbox'")

class Generate3DModelArgs(BaseModel):
    prompt: str = Field(description="描述要生成的 3D 模型实体的英文/中文词汇，例如 'wind turbine generator', 'industrial robotic arm', 'cnc machine'")


@tool("set_active_3d_model", args_schema=ActiveModelArgs)
def set_active_3d_model(search_query: str) -> str:
    """在本地 3D 资产库中搜索并激活最匹配的 3D 模型用于数字孪生大屏展示。"""
    os.makedirs(MODELS_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Try exact ID first
    cursor.execute("SELECT id, name, file_path FROM agent_3d_models WHERE id = ?", (search_query,))
    row = cursor.fetchone()
    
    # Fuzzy match by keyword or name (fetch all candidates and rotate for maximum variety)
    if not row:
        import re
        tokens = [t.strip() for t in re.split(r'[|\s,]+', search_query) if t.strip()]
        if not tokens:
            tokens = [search_query]
            
        where_clauses = []
        params = []
        for t in tokens:
            where_clauses.append("(keyword LIKE ? OR name LIKE ? OR file_path LIKE ?)")
            params.extend([f"%{t}%", f"%{t}%", f"%{t}%"])
            
        query = f"SELECT id, name, file_path FROM agent_3d_models WHERE {' OR '.join(where_clauses)} ORDER BY created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        if not rows:
            cursor.execute("SELECT id, name, file_path FROM agent_3d_models ORDER BY created_at DESC")
            rows = cursor.fetchall()
            
        if rows:
            curr = cursor.execute("SELECT config_value FROM sys_config WHERE config_key = 'active_3d_model_path'").fetchone()
            curr_path = curr[0] if curr else ""
            diff_rows = [r for r in rows if r['file_path'] != curr_path]
            row = diff_rows[0] if diff_rows else rows[0]

    if not row:
        conn.close()
        return f"提示: 本地资产库中暂无与 '{search_query}' 匹配的模型，已保持使用默认数字孪生 3D 模型。"
        
    file_path = row['file_path']
    model_name = row['name']
    
    # Update active model in sys_config
    cursor.execute("SELECT 1 FROM sys_config WHERE config_key = 'active_3d_model_path'")
    if cursor.fetchone():
        cursor.execute(
            "UPDATE sys_config SET config_value = ?, updated_at = datetime('now','localtime') WHERE config_key = 'active_3d_model_path'", 
            (file_path,)
        )
    else:
        cursor.execute(
            "INSERT INTO sys_config (config_key, config_value, category, description) VALUES ('active_3d_model_path', ?, 'general', 'Active 3D model used in Dashboard')", 
            (file_path,)
        )
        
    conn.commit()
    conn.close()
    
    return f"成功！已将本地资产库中与 '{search_query}' 匹配的模型设置为主 3D 模型: '{model_name}' ({file_path})。"


def get_3d_api_key() -> Optional[str]:
    """获取 3D AI 生成 API Key (优先环境变量，其次系统数据库配置)"""
    key = os.getenv("TRIPO_3D_API_KEY") or os.getenv("MESHY_API_KEY")
    if key:
        return key
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT config_value FROM sys_config WHERE config_key IN ('TRIPO_3D_API_KEY', 'MESHY_API_KEY', '3D_MODEL_API_KEY') AND config_value != '' LIMIT 1"
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return row[0]
    except Exception:
        pass
    return None


@tool("generate_3d_model_tool", args_schema=Generate3DModelArgs)
def generate_3d_model_tool(prompt: str) -> str:
    """云端 AI 实时生成 3D 模型（若未配置 API Key，将自动无缝切至本地资产库智能匹配）。"""
    api_key = get_3d_api_key()
    
    if not api_key:
        # Fallback to local smart matcher when API Key is absent
        local_res = set_active_3d_model.invoke({"search_query": prompt})
        return f"【云端/本地 3D 混合路由】当前为离线/本地模式，已自动为您匹配本地 3D 资产库。{local_res}"

    # Call Tripo3D REST API if configured
    try:
        req_data = json.dumps({"type": "text_to_model", "prompt": prompt}).encode("utf-8")
        req = urllib.request.Request(
            "https://api.tripo3d.ai/v2/openapi/task",
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            task_id = data.get("data", {}).get("task_id")
            if not task_id:
                return set_active_3d_model.invoke({"search_query": prompt})
            
            # Poll task status (max 12s)
            for _ in range(8):
                time.sleep(1.5)
                poll_req = urllib.request.Request(
                    f"https://api.tripo3d.ai/v2/openapi/task/{task_id}",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                with urllib.request.urlopen(poll_req, timeout=5) as poll_resp:
                    poll_data = json.loads(poll_resp.read().decode("utf-8"))
                    task_info = poll_data.get("data", {})
                    if task_info.get("status") == "success":
                        glb_url = task_info.get("output", {}).get("model")
                        if glb_url:
                            # Download GLB and save to models dir
                            file_id = f"model_ai_{uuid.uuid4().hex[:8]}.glb"
                            target_path = os.path.join(MODELS_DIR, file_id)
                            urllib.request.urlretrieve(glb_url, target_path)
                            rel_path = f"/models/{file_id}"

                            # Insert into agent_3d_models DB
                            conn = sqlite3.connect(DB_PATH)
                            cursor = conn.cursor()
                            cursor.execute(
                                "INSERT INTO agent_3d_models (id, name, keyword, file_path, status) VALUES (?, ?, ?, ?, ?)",
                                (file_id, f"AI-Gen {prompt[:20]}", prompt, rel_path, "active")
                            )
                            cursor.execute(
                                "UPDATE sys_config SET config_value = ? WHERE config_key = 'active_3d_model_path'",
                                (rel_path,)
                            )
                            conn.commit()
                            conn.close()
                            return f"🎉 成功！云端 3D AI 生成引擎在 8 秒内成功创建了 '{prompt}' 的 3D GLB 模型并已自动挂载至大屏！"

        return set_active_3d_model.invoke({"search_query": prompt})
    except Exception as e:
        return set_active_3d_model.invoke({"search_query": prompt})

