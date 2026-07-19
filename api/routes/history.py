import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from infra.database import get_connection
from infra.interaction_metrics import ensure_metrics_schema, estimate_eta_ms

router = APIRouter()

SIDEA_DB = "database/SIDEA.db"


def ensure_history_schema(db_path: str = SIDEA_DB) -> None:
    """会话文件夹 + session.folder_id / is_pinned 迁移。"""
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_folders (
                folder_id   TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                is_pinned   INTEGER NOT NULL DEFAULT 1,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        cols = {r[1] for r in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()}
        if "folder_id" not in cols:
            conn.execute("ALTER TABLE chat_sessions ADD COLUMN folder_id TEXT")
        if "is_pinned" not in cols:
            conn.execute("ALTER TABLE chat_sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
        conn.commit()


class ChatSession(BaseModel):
    session_id: str
    title: str
    created_at: str
    folder_id: Optional[str] = None
    is_pinned: bool = False


class ChatFolder(BaseModel):
    folder_id: str
    name: str
    is_pinned: bool = True
    sort_order: int = 0
    created_at: str
    session_count: int = 0


class ChatMessage(BaseModel):
    message_id: str
    session_id: str
    role: str
    content: str
    trace_events: Optional[str] = None
    run_meta: Optional[str] = None
    attachments: Optional[str] = None
    created_at: str


class EtaRequest(BaseModel):
    skill_id: str = "plc_diagnostics"
    message: str = ""
    has_attachment: bool = False


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class FolderUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    is_pinned: Optional[bool] = None
    sort_order: Optional[int] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    folder_id: Optional[str] = None  # 传 null / 缺省：不改；传 ""：移出文件夹
    clear_folder: bool = False
    is_pinned: Optional[bool] = None


@router.get("/history/sessions", response_model=List[ChatSession])
def get_sessions():
    """获取所有历史对话列表"""
    try:
        ensure_history_schema()
        with get_connection(SIDEA_DB) as conn:
            rows = conn.execute(
                """
                SELECT session_id, title, created_at, folder_id, COALESCE(is_pinned, 0) AS is_pinned
                FROM chat_sessions
                ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC
                """
            ).fetchall()
            return [
                ChatSession(
                    session_id=r["session_id"],
                    title=r["title"] or "New Chat",
                    created_at=r["created_at"],
                    folder_id=r["folder_id"],
                    is_pinned=bool(r["is_pinned"]),
                )
                for r in rows
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/folders", response_model=List[ChatFolder])
def get_folders():
    """获取会话文件夹列表（含会话数）"""
    try:
        ensure_history_schema()
        with get_connection(SIDEA_DB) as conn:
            rows = conn.execute(
                """
                SELECT f.folder_id, f.name, f.is_pinned, f.sort_order, f.created_at,
                       COALESCE(c.cnt, 0) AS session_count
                FROM chat_folders f
                LEFT JOIN (
                    SELECT folder_id, COUNT(*) AS cnt
                    FROM chat_sessions
                    WHERE folder_id IS NOT NULL AND folder_id != ''
                    GROUP BY folder_id
                ) c ON c.folder_id = f.folder_id
                ORDER BY f.is_pinned DESC, f.sort_order ASC, f.created_at ASC
                """
            ).fetchall()
            return [
                ChatFolder(
                    folder_id=r["folder_id"],
                    name=r["name"],
                    is_pinned=bool(r["is_pinned"]),
                    sort_order=int(r["sort_order"] or 0),
                    created_at=r["created_at"],
                    session_count=int(r["session_count"] or 0),
                )
                for r in rows
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history/folders", response_model=ChatFolder)
def create_folder(body: FolderCreate):
    ensure_history_schema()
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")
    folder_id = uuid.uuid4().hex
    try:
        with get_connection(SIDEA_DB) as conn:
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM chat_folders").fetchone()[0]
            conn.execute(
                """
                INSERT INTO chat_folders (folder_id, name, is_pinned, sort_order)
                VALUES (?, ?, 1, ?)
                """,
                (folder_id, name, int(max_order) + 1),
            )
            conn.commit()
            row = conn.execute(
                "SELECT folder_id, name, is_pinned, sort_order, created_at FROM chat_folders WHERE folder_id = ?",
                (folder_id,),
            ).fetchone()
            return ChatFolder(
                folder_id=row["folder_id"],
                name=row["name"],
                is_pinned=bool(row["is_pinned"]),
                sort_order=int(row["sort_order"] or 0),
                created_at=row["created_at"],
                session_count=0,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/history/folders/{folder_id}", response_model=ChatFolder)
def update_folder(folder_id: str, body: FolderUpdate):
    ensure_history_schema()
    try:
        with get_connection(SIDEA_DB) as conn:
            row = conn.execute(
                "SELECT folder_id, name, is_pinned, sort_order, created_at FROM chat_folders WHERE folder_id = ?",
                (folder_id,),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="文件夹不存在")
            name = row["name"] if body.name is None else body.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="文件夹名称不能为空")
            is_pinned = int(row["is_pinned"]) if body.is_pinned is None else (1 if body.is_pinned else 0)
            sort_order = int(row["sort_order"] or 0) if body.sort_order is None else int(body.sort_order)
            conn.execute(
                """
                UPDATE chat_folders
                SET name = ?, is_pinned = ?, sort_order = ?,
                    updated_at = datetime('now','localtime')
                WHERE folder_id = ?
                """,
                (name, is_pinned, sort_order, folder_id),
            )
            conn.commit()
            cnt = conn.execute(
                "SELECT COUNT(*) FROM chat_sessions WHERE folder_id = ?",
                (folder_id,),
            ).fetchone()[0]
            return ChatFolder(
                folder_id=folder_id,
                name=name,
                is_pinned=bool(is_pinned),
                sort_order=sort_order,
                created_at=row["created_at"],
                session_count=int(cnt or 0),
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/folders/{folder_id}")
def delete_folder(folder_id: str):
    """删除文件夹；其中的会话回到「最近」。"""
    ensure_history_schema()
    try:
        with get_connection(SIDEA_DB) as conn:
            conn.execute("UPDATE chat_sessions SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
            cur = conn.execute("DELETE FROM chat_folders WHERE folder_id = ?", (folder_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="文件夹不存在")
            return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/history/sessions/{session_id}", response_model=ChatSession)
def update_session(session_id: str, body: SessionUpdate):
    """重命名 / 移入移出文件夹 / 固定会话。"""
    ensure_history_schema()
    try:
        with get_connection(SIDEA_DB) as conn:
            row = conn.execute(
                """
                SELECT session_id, title, created_at, folder_id, COALESCE(is_pinned, 0) AS is_pinned
                FROM chat_sessions WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="会话不存在")

            title = row["title"] if body.title is None else body.title.strip()
            if not title:
                raise HTTPException(status_code=400, detail="标题不能为空")

            folder_id = row["folder_id"]
            if body.clear_folder:
                folder_id = None
            elif body.folder_id is not None:
                folder_id = body.folder_id.strip() or None
                if folder_id:
                    exists = conn.execute(
                        "SELECT 1 FROM chat_folders WHERE folder_id = ?",
                        (folder_id,),
                    ).fetchone()
                    if not exists:
                        raise HTTPException(status_code=400, detail="目标文件夹不存在")

            is_pinned = int(row["is_pinned"]) if body.is_pinned is None else (1 if body.is_pinned else 0)
            conn.execute(
                """
                UPDATE chat_sessions
                SET title = ?, folder_id = ?, is_pinned = ?,
                    updated_at = datetime('now','localtime')
                WHERE session_id = ?
                """,
                (title, folder_id, is_pinned, session_id),
            )
            conn.commit()
            return ChatSession(
                session_id=session_id,
                title=title or "New Chat",
                created_at=row["created_at"],
                folder_id=folder_id,
                is_pinned=bool(is_pinned),
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/sessions/{session_id}/messages", response_model=List[ChatMessage])
def get_messages(session_id: str):
    """获取指定会话的历史记录"""
    try:
        ensure_metrics_schema()
        ensure_history_schema()
        with get_connection(SIDEA_DB) as conn:
            rows = conn.execute(
                "SELECT message_id, session_id, role, content, trace_events, run_meta, attachments, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            ).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                out.append(ChatMessage(
                    message_id=d["message_id"],
                    session_id=d["session_id"],
                    role=d["role"],
                    content=d["content"],
                    trace_events=d.get("trace_events"),
                    run_meta=d.get("run_meta"),
                    attachments=d.get("attachments"),
                    created_at=d["created_at"],
                ))
            return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history/eta")
def predict_eta(req: EtaRequest):
    """根据历史交互耗时，估算新任务预计完成时间。"""
    try:
        return estimate_eta_ms(
            skill_id=req.skill_id,
            user_chars=len(req.message or ""),
            has_attachment=req.has_attachment,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/sessions/{session_id}")
def delete_session(session_id: str):
    """删除指定的会话"""
    try:
        with get_connection(SIDEA_DB) as conn:
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
        ensure_history_schema()
        with get_connection(SIDEA_DB) as conn:
            conn.execute("INSERT INTO chat_sessions (session_id, title) VALUES (?, ?)", (session_id, "New Chat"))
            conn.commit()
            return {"session_id": session_id, "title": "New Chat"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
