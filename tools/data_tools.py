from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field
import pandas as pd
from io import StringIO
import asyncio

class DataCleanArgs(BaseModel):
    csv_data: str = Field(description="包含数据的 CSV 格式字符串")
    drop_na: bool = Field(description="是否删除包含空值的行", default=True)
    dedup: bool = Field(description="是否删除重复行", default=True)

class LogSplitArgs(BaseModel):
    raw_log: str = Field(description="原始大段日志内容")
    chunk_size: int = Field(description="按行数拆分块的大小", default=500)

class TextToSqlArgs(BaseModel):
    natural_query: str = Field(description="用户的自然语言查询需求")

def _clean_data_sync(csv_data: str, drop_na: bool, dedup: bool) -> str:
    try:
        df = pd.read_csv(StringIO(csv_data))
        initial_len = len(df)
        if drop_na:
            df.dropna(inplace=True)
        if dedup:
            df.drop_duplicates(inplace=True)
        final_len = len(df)
        return f"清洗完成，原数据 {initial_len} 行，清洗后 {final_len} 行。\n{df.to_csv(index=False)}"
    except Exception as e:
        return f"数据清洗失败: {e}"

clean_data = StructuredTool.from_function(
    func=_clean_data_sync,
    coroutine=lambda csv_data, drop_na, dedup: asyncio.to_thread(_clean_data_sync, csv_data, drop_na, dedup),
    name="clean_data",
    description="清洗 CSV 数据：删除空值或去重，返回清洗后的 CSV 字符串",
    args_schema=DataCleanArgs,
)

@tool("split_log", args_schema=LogSplitArgs)
def split_log(raw_log: str, chunk_size: int) -> str:
    """将极长的原始日志拆分为摘要和多块，便于大语言模型渐进分析（纯内存操作）"""
    lines = raw_log.splitlines()
    total = len(lines)
    if total <= chunk_size:
        return raw_log
    summary = f"日志过长 (总计 {total} 行)。已提取首尾关键信息:\n"
    summary += "--- [头部] ---\n" + "\n".join(lines[:100]) + "\n"
    summary += f"--- [省略 {total - 200} 行] ---\n"
    summary += "--- [尾部] ---\n" + "\n".join(lines[-100:]) + "\n"
    return summary

@tool("text_to_sql", args_schema=TextToSqlArgs)
def text_to_sql(natural_query: str) -> str:
    """将自然语言转化为 SQL 并在本地知识库执行（当前为桩环境）"""
    return (
        f"【Text-to-SQL 代理执行结果】模拟已执行查询 '{natural_query}'。\n"
        f"查询结果：找到了 5 条匹配记录，平均响应时间为 230ms。"
    )
