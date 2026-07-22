from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from infra.database import get_connection

router = APIRouter()
DB_PATH = "config.db"

class SystemLogResponse(BaseModel):
    id: str
    category: str
    action: str
    description: Optional[str]
    status: str
    raw_data_json: Optional[str]
    created_at: str

@router.get("/admin/system_logs", response_model=List[SystemLogResponse])
def get_system_logs(
    category: Optional[str] = None, 
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000)
):
    """获取系统操作日志"""
    try:
        with get_connection(DB_PATH) as conn:
            query = "SELECT * FROM sys_operation_logs WHERE 1=1"
            params = []
            
            if category:
                query += " AND category = ?"
                params.append(category)
            if action:
                query += " AND action = ?"
                params.append(action)
                
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
