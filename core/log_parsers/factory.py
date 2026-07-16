from core.log_parsers.base import BaseLogParser
from core.log_parsers.plc_parser import PLCLogParser
from core.log_parsers.rcs_parser import RCSLogParser

class ParserFactory:
    """解析器工厂——根据日志类型创建对应的 Parser 实例"""
    
    _registry: dict[str, type] = {}
    
    @classmethod
    def register(cls, log_type: str, parser_class: type):
        cls._registry[log_type] = parser_class
    
    @classmethod
    def create(cls, log_type: str, config_store) -> BaseLogParser:
        parser_class = cls._registry.get(log_type)
        if not parser_class:
            raise ValueError(f"未注册的日志类型: {log_type}，可用类型: {list(cls._registry.keys())}")
        
        log_dir = config_store.get(f"PATH_LOG_{log_type.upper()}")
        regex = config_store.get(f"REGEX_{log_type.upper()}_ERROR")
        
        if not log_dir:
            raise ValueError(f"未配置日志路径: PATH_LOG_{log_type.upper()}")
        
        return parser_class(log_dir=log_dir, regex_pattern=regex)

# 模块加载时自动注册
ParserFactory.register("plc", PLCLogParser)
ParserFactory.register("rcs", RCSLogParser)
