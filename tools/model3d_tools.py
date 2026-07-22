import sqlite3
import os
from langchain_core.tools import tool

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.db')

@tool("set_active_3d_model")
def set_active_3d_model(search_query: str) -> str:
    """
    Sets the active 3D model for the dashboard's digital twin 3D map.
    
    Args:
        search_query (str): The keyword, name, or ID of the model to search for. E.g., 'agv', 'robot', 'arm'.
        
    Returns:
        str: A message indicating success or failure.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Try exact ID first
    cursor.execute("SELECT id, name, file_path FROM agent_3d_models WHERE id = ?", (search_query,))
    row = cursor.fetchone()
    
    # If not found, try fuzzy match on keyword or name
    if not row:
        like_query = f"%{search_query}%"
        cursor.execute("SELECT id, name, file_path FROM agent_3d_models WHERE keyword LIKE ? OR name LIKE ? ORDER BY created_at DESC", (like_query, like_query))
        row = cursor.fetchone()
        
    if not row:
        conn.close()
        return f"Error: No 3D model found matching '{search_query}'. Please download or upload one first."
        
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
    
    return f"Success! Active 3D model has been set to '{model_name}' ({file_path}). The dashboard will immediately reflect this change."
