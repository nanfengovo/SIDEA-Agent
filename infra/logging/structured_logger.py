import logging
import json
from datetime import datetime
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "module": record.module,
            "message": record.getMessage(),
        }
        
        # 将传入的 extra 字典合并到 JSON 中
        if hasattr(record, "extra_data") and isinstance(record.extra_data, dict):
            log_data["extra"] = record.extra_data
            
        return json.dumps(log_data, ensure_ascii=False)

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    
    # 避免重复添加 Handler
    if logger.handlers:
        return logger
        
    logger.setLevel(logging.INFO)
    
    # 控制台 Handler (支持彩色，开发用)
    console_handler = logging.StreamHandler()
    console_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
    )
    console_handler.setFormatter(console_formatter)
    
    # 文件 Handler (严格 JSON)
    log_dir = Path(__file__).parent.parent.parent / 'logs' / 'app'
    log_dir.mkdir(parents=True, exist_ok=True)
    
    file_handler = TimedRotatingFileHandler(
        filename=log_dir / 'sidea.log',
        when='midnight',
        interval=1,
        backupCount=30,
        encoding='utf-8'
    )
    file_handler.setFormatter(JSONFormatter())
    
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    
    return logger

class StructuredLoggerAdapter(logging.LoggerAdapter):
    """用于方便地传递 extra_data"""
    def process(self, msg, kwargs):
        extra_data = kwargs.pop('extra', {})
        kwargs["extra"] = {"extra_data": extra_data}
        return msg, kwargs

def get_structured_logger(name: str):
    logger = get_logger(name)
    return StructuredLoggerAdapter(logger, {})

if __name__ == "__main__":
    logger = get_structured_logger("test.module")
    logger.info("用户提问", extra={"user_id": "admin", "query": "PLC停机"})
