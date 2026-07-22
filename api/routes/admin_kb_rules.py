import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from infra.database import get_connection

router = APIRouter()
DB_PATH = "config.db"

class ReviewRuleCreate(BaseModel):
    rule_name: str = Field(..., min_length=1, max_length=100)
    prompt: str = Field(..., min_length=1)
    is_active: bool = True

class ReviewRuleUpdate(BaseModel):
    rule_name: Optional[str] = Field(None, min_length=1, max_length=100)
    prompt: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None

class ReviewRuleResponse(BaseModel):
    id: str
    rule_name: str
    prompt: str
    is_active: bool
    last_executed_at: Optional[str] = None
    created_at: str
    updated_at: str

@router.get("/admin/kb_rules", response_model=List[ReviewRuleResponse])
def get_kb_rules():
    """获取所有知识库自动审核规则"""
    try:
        with get_connection(DB_PATH) as conn:
            rows = conn.execute("SELECT * FROM kb_review_rules ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/kb_rules", response_model=ReviewRuleResponse)
def create_kb_rule(rule: ReviewRuleCreate):
    """创建新的知识库自动审核规则"""
    rule_id = str(uuid.uuid4())
    try:
        with get_connection(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO kb_review_rules (id, rule_name, prompt, is_active)
                VALUES (?, ?, ?, ?)
                """,
                (rule_id, rule.rule_name, rule.prompt, 1 if rule.is_active else 0)
            )
            conn.commit()
            row = conn.execute("SELECT * FROM kb_review_rules WHERE id = ?", (rule_id,)).fetchone()
            return dict(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/admin/kb_rules/{rule_id}", response_model=ReviewRuleResponse)
def update_kb_rule(rule_id: str, rule: ReviewRuleUpdate):
    """更新知识库自动审核规则"""
    try:
        with get_connection(DB_PATH) as conn:
            row = conn.execute("SELECT * FROM kb_review_rules WHERE id = ?", (rule_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="规则不存在")

            rule_name = row["rule_name"] if rule.rule_name is None else rule.rule_name
            prompt = row["prompt"] if rule.prompt is None else rule.prompt
            is_active = int(row["is_active"]) if rule.is_active is None else (1 if rule.is_active else 0)

            conn.execute(
                """
                UPDATE kb_review_rules 
                SET rule_name = ?, prompt = ?, is_active = ?, updated_at = datetime('now','localtime')
                WHERE id = ?
                """,
                (rule_name, prompt, is_active, rule_id)
            )
            conn.commit()
            
            updated_row = conn.execute("SELECT * FROM kb_review_rules WHERE id = ?", (rule_id,)).fetchone()
            return dict(updated_row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/kb_rules/{rule_id}")
def delete_kb_rule(rule_id: str):
    """删除知识库自动审核规则"""
    try:
        with get_connection(DB_PATH) as conn:
            conn.execute("DELETE FROM kb_review_rules WHERE id = ?", (rule_id,))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
