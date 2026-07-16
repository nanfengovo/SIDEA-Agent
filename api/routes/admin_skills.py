from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from infra.database import get_connection
import json

router = APIRouter()
DB_PATH = "config.db"

class SkillData(BaseModel):
    skill_id: str
    skill_name: str
    description: str = ""
    template_path: str
    bound_tools: List[str] = []
    temperature: float = 0.1
    is_enabled: int = 1
    sort_order: int = 0

@router.get("/admin/skills")
def get_all_skills():
    with get_connection(DB_PATH) as conn:
        rows = conn.execute("SELECT * FROM skills ORDER BY sort_order ASC, created_at DESC").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["bound_tools"] = json.loads(d["bound_tools"]) if d["bound_tools"] else []
            result.append(d)
        return result

@router.post("/admin/skills")
def create_skill(data: SkillData):
    with get_connection(DB_PATH) as conn:
        try:
            conn.execute(
                """
                INSERT INTO skills 
                (skill_id, skill_name, description, template_path, bound_tools, temperature, is_enabled, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (data.skill_id, data.skill_name, data.description, data.template_path, json.dumps(data.bound_tools), data.temperature, data.is_enabled, data.sort_order)
            )
            conn.commit()
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@router.put("/admin/skills/{skill_id}")
def update_skill(skill_id: str, data: SkillData):
    with get_connection(DB_PATH) as conn:
        try:
            conn.execute(
                """
                UPDATE skills SET
                skill_name = ?, description = ?, template_path = ?, bound_tools = ?, 
                temperature = ?, is_enabled = ?, sort_order = ?, updated_at = datetime('now','localtime')
                WHERE skill_id = ?
                """,
                (data.skill_name, data.description, data.template_path, json.dumps(data.bound_tools), data.temperature, data.is_enabled, data.sort_order, skill_id)
            )
            conn.commit()
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@router.delete("/admin/skills/{skill_id}")
def delete_skill(skill_id: str):
    with get_connection(DB_PATH) as conn:
        conn.execute("DELETE FROM skills WHERE skill_id = ?", (skill_id,))
        conn.commit()
        return {"status": "success"}
