from fastapi import APIRouter
from infra.database import get_connection

router = APIRouter()

@router.get("/skills")
def get_skills():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM skills").fetchall()
        return [dict(row) for row in rows]
