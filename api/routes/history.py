import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from infra.database import get_connection

router = APIRouter()

class ChatSession(BaseModel):
    session_id: str
    title: str
    created_at: str

class ChatMessage(BaseModel):
    message_id: str
    session_id: str
    role: str
    content: str
    trace_events: Optional[str] = None
    created_at: str

@router.get("/history/sessions", response_model=List[ChatSession])
def get_sessions():
    """获取所有历史对话列表"""
    try:
        with get_connection("database/SIDEA.db") as conn:
            rows = conn.execute("SELECT session_id, title, created_at FROM chat_sessions ORDER BY created_at DESC").fetchall()
            return [ChatSession(session_id=r["session_id"], title=r["title"] or "New Chat", created_at=r["created_at"]) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/sessions/{session_id}/messages", response_model=List[ChatMessage])
def get_messages(session_id: str):
    """获取指定会话的历史记录"""
    try:
        with get_connection("database/SIDEA.db") as conn:
            rows = conn.execute("SELECT message_id, session_id, role, content, trace_events, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
            return [ChatMessage(**dict(r)) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/sessions/{session_id}")
def delete_session(session_id: str):
    """删除指定的会话"""
    try:
        with get_connection("database/SIDEA.db") as conn:
            conn.execute("DELETE FROM chat_sessions WHERE session_id = ?", (session_id,))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/history/sessions")
def create_session():
    """新建会话"""
    session_id = str(uuid.uuid4())
    try:
        with get_connection("database/SIDEA.db") as conn:
            conn.execute("INSERT INTO chat_sessions (session_id, title) VALUES (?, ?)", (session_id, "New Chat"))
            conn.commit()
            return {"session_id": session_id, "title": "New Chat"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
