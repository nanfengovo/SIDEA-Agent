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


class AnomalyDetectArgs(BaseModel):
    csv_data: str = Field(description="包含时间序列或传感器指标的 CSV 格式字符串")
    target_column: str = Field(description="要进行异常检测的数值列列名")
    method: str = Field(description="检测算法: 'zscore' 或 'iqr'", default="zscore")
    threshold: float = Field(description="异常判断阈值 (Z-Score 默认 3.0, IQR 默认 1.5)", default=3.0)


@tool("detect_anomalies", args_schema=AnomalyDetectArgs)
def detect_anomalies(csv_data: str, target_column: str, method: str = "zscore", threshold: float = 3.0) -> str:
    """对工业传感器/PLC 时序数据进行 Z-Score 或 IQR 离群点异常检测与统计分析"""
    import numpy as np
    try:
        df = pd.read_csv(StringIO(csv_data))
        if target_column not in df.columns:
            return f"异常检测失败：未在数据中找到列名 '{target_column}'。可用列：{list(df.columns)}"

        series = pd.to_numeric(df[target_column], errors="coerce").dropna()
        if len(series) == 0:
            return f"列 '{target_column}' 不包含可计数的数值型数据。"

        mean_val = float(series.mean())
        std_val = float(series.std())
        min_val = float(series.min())
        max_val = float(series.max())

        anomalies_idx = []
        if method.lower() == "iqr":
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - threshold * iqr
            upper_bound = q3 + threshold * iqr
            anomalies = df[(df[target_column] < lower_bound) | (df[target_column] > upper_bound)]
            anomalies_idx = anomalies.index.tolist()
        else:
            # Z-Score
            z_scores = np.abs((series - mean_val) / (std_val if std_val > 0 else 1.0))
            anomalies = df.loc[z_scores > threshold]
            anomalies_idx = anomalies.index.tolist()

        result = (
            f"📊 【数据统计分析报告 - 列: {target_column}】\n"
            f"- 样本总数: {len(series)} 行\n"
            f"- 均值 (Mean): {mean_val:.2f} | 标准差 (Std): {std_val:.2f}\n"
            f"- 最小值 (Min): {min_val:.2f} | 最大值 (Max): {max_val:.2f}\n"
            f"- 算法: {method.upper()} (阈值={threshold})\n"
            f"- 发现异常离群点数量: {len(anomalies_idx)} 处\n"
        )
        if anomalies_idx:
            sample_anomalies = anomalies.head(5).to_dict(orient="records")
            result += f"- 前 5 处异常样本: {sample_anomalies}\n"
        else:
            result += "- 数据运行平稳，未发现显著超出阈值的异常偏移点。\n"
        return result
    except Exception as e:
        return f"异常检测处理失败: {e}"
