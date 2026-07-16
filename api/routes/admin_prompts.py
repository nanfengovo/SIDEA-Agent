from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from pathlib import Path

router = APIRouter()
PROJECT_ROOT = Path(__file__).parent.parent.parent

class PromptData(BaseModel):
    path: str
    content: str

@router.get("/admin/prompts")
def get_prompt(path: str):
    target_path = (PROJECT_ROOT / path).resolve()
    skills_dir = (PROJECT_ROOT / "skills").resolve()
    
    if not str(target_path).startswith(str(skills_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not target_path.exists():
        return {"content": ""}
        
    with open(target_path, "r", encoding="utf-8") as f:
        return {"content": f.read()}

@router.post("/admin/prompts")
def save_prompt(data: PromptData):
    target_path = (PROJECT_ROOT / data.path).resolve()
    skills_dir = (PROJECT_ROOT / "skills").resolve()
    
    if not str(target_path).startswith(str(skills_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
        
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    return {"status": "success"}
