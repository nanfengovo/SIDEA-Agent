import uuid
import json
from datetime import datetime
from typing import Optional, Any, Dict
from infra.database import get_connection
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("core.audit_logger")

DB_PATH = "config.db"

def log_operation(category: str, action: str, description: str, status: str = "success", raw_data: Optional[Dict[str, Any]] = None):
    """
    General function to log a system operation.
    """
    log_id = str(uuid.uuid4())
    raw_data_json = json.dumps(raw_data, ensure_ascii=False) if raw_data else None
    
    try:
        with get_connection(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO sys_operation_logs (id, category, action, description, status, raw_data_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (log_id, category, action, description, status, raw_data_json)
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

def log_human_op(action: str, description: str, status: str = "success", raw_data: Optional[Dict[str, Any]] = None):
    log_operation("HUMAN_OP", action, description, status, raw_data)

def log_auto_task(action: str, description: str, status: str = "success", raw_data: Optional[Dict[str, Any]] = None):
    log_operation("AUTO_TASK", action, description, status, raw_data)

def log_api_in(action: str, description: str, status: str = "success", raw_data: Optional[Dict[str, Any]] = None):
    log_operation("API_IN", action, description, status, raw_data)

def log_api_out(action: str, description: str, status: str = "success", raw_data: Optional[Dict[str, Any]] = None):
    log_operation("API_OUT", action, description, status, raw_data)
