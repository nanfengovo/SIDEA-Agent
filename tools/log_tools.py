from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from core.log_parsers.factory import ParserFactory
from infra.config_store import ConfigStore
import asyncio

config_store = ConfigStore()

class LogQueryArgs(BaseModel):
    date_str: str = Field(description="查询日期，格式: YYYY-MM-DD")

def _read_plc_log_sync(date_str: str) -> str:
    """同步实现 - 用于 .stream() 同步调用场景"""
    try:
        parser = ParserFactory.create("plc", config_store)
        df = parser.parse_directory(date_str)
        if df.empty:
            return "未找到匹配的日志。"
        agg_df = parser.aggregate(df)
        return parser.to_markdown(agg_df)
    except Exception as e:
        return f"日志读取失败: {e}"

async def _read_plc_log_async(date_str: str) -> str:
    """异步实现 - 用于 .astream() / astream_events() 异步调用场景"""
    return await asyncio.to_thread(_read_plc_log_sync, date_str)

read_plc_log = StructuredTool.from_function(
    func=_read_plc_log_sync,
    coroutine=_read_plc_log_async,
    name="read_plc_log",
    description="提取和汇总指定日期的 PLC 报错与异常日志",
    args_schema=LogQueryArgs,
)

def _read_rcs_log_sync(date_str: str) -> str:
    """同步实现"""
    try:
        parser = ParserFactory.create("rcs", config_store)
        df = parser.parse_directory(date_str)
        if df.empty:
            return "未找到匹配的日志。"
        agg_df = parser.aggregate(df)
        return parser.to_markdown(agg_df)
    except Exception as e:
        return f"日志读取失败: {e}"

async def _read_rcs_log_async(date_str: str) -> str:
    """异步实现"""
    return await asyncio.to_thread(_read_rcs_log_sync, date_str)

read_rcs_log = StructuredTool.from_function(
    func=_read_rcs_log_sync,
    coroutine=_read_rcs_log_async,
    name="read_rcs_log",
    description="提取和汇总指定日期的 RCS API 性能与错误日志",
    args_schema=LogQueryArgs,
)