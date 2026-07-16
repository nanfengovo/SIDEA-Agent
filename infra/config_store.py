import sqlite3
from typing import Optional, List, Dict
from infra.database import get_connection

class ConfigStore:
    def __init__(self, db_path: str = "config.db"):
        self.db_path = db_path

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """获取单个配置值。不存在时返回 default，不抛异常"""
        try:
            with get_connection(self.db_path) as conn:
                row = conn.execute(
                    "SELECT config_value FROM sys_config WHERE config_key = ?", (key,)
                ).fetchone()
                if row:
                    return row["config_value"]
                return default
        except Exception:
            return default

    def get_int(self, key: str, default: int = 0) -> int:
        """获取并转为 int"""
        val = self.get(key)
        if val is not None:
            try:
                return int(val)
            except ValueError:
                return default
        return default

    def get_float(self, key: str, default: float = 0.0) -> float:
        """获取并转为 float"""
        val = self.get(key)
        if val is not None:
            try:
                return float(val)
            except ValueError:
                return default
        return default

    def set(self, key: str, value: str, category: str = 'general', description: str = ''):
        """写入或更新配置。用 INSERT OR REPLACE"""
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sys_config (config_key, config_value, category, description, updated_at)
                VALUES (?, ?, ?, ?, datetime('now','localtime'))
                """, (key, value, category, description)
            )
            conn.commit()

    def get_by_category(self, category: str) -> List[Dict]:
        """按分类查询所有配置"""
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM sys_config WHERE category = ?", (category,)
            ).fetchall()
            return [dict(row) for row in rows]

    def get_all(self) -> List[Dict]:
        """获取全部配置（给前端管理页面用）"""
        with get_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM sys_config").fetchall()
            return [dict(row) for row in rows]

    def delete(self, key: str) -> bool:
        """删除配置项，返回是否删除成功"""
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sys_config WHERE config_key = ?", (key,))
            conn.commit()
            return cursor.rowcount > 0

if __name__ == "__main__":
    store = ConfigStore("config.db")
    print(store.get("LLM_MODEL_NAME"))
    print(store.get("NOT_EXIST", "fallback"))
    print(store.get_int("LLM_MAX_TOKENS"))
    print(store.get_by_category("model"))
