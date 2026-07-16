import hashlib
from typing import Optional
from datetime import datetime, timedelta
from infra.database import get_connection

class AnalysisCache:
    def __init__(self, db_path: str = "config.db", expire_hours: int = 24):
        self.db_path = db_path
        self.expire_hours = expire_hours
    
    @staticmethod
    def compute_hash(data: str) -> str:
        """对清洗后的日志数据计算 SHA256 哈希"""
        return hashlib.sha256(data.encode('utf-8')).hexdigest()
    
    def get(self, data_hash: str) -> Optional[str]:
        """
        查询缓存。需同时检查是否过期
        """
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT result_text FROM analysis_cache 
                WHERE data_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now','localtime'))
                """, (data_hash,)
            ).fetchone()
            if row:
                return row["result_text"]
        return None
    
    def set(self, data_hash: str, skill_id: str, query_text: str, result_text: str):
        """写入缓存，自动计算 expires_at"""
        expires_at = (datetime.now() + timedelta(hours=self.expire_hours)).strftime("%Y-%m-%d %H:%M:%S")
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO analysis_cache (data_hash, skill_id, query_text, result_text, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """, (data_hash, skill_id, query_text, result_text, expires_at)
            )
            conn.commit()
    
    def clear_expired(self):
        """清理过期缓存"""
        with get_connection(self.db_path) as conn:
            conn.execute("DELETE FROM analysis_cache WHERE expires_at <= datetime('now','localtime')")
            conn.commit()
