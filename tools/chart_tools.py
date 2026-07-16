from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
import pandas as pd
from io import StringIO
import asyncio

class ChartArgs(BaseModel):
    csv_data: str = Field(description="包含数据的 CSV 格式字符串")
    x_col: str = Field(description="X轴列名")
    y_col: str = Field(description="Y轴列名")
    title: str = Field(description="图表标题")

def _gen_line_chart_sync(csv_data: str, x_col: str, y_col: str, title: str) -> str:
    try:
        from core.chart_engine import ChartEngine
        engine = ChartEngine()
        df = pd.read_csv(StringIO(csv_data))
        path = engine.generate_line_chart(df, x_col, y_col, title)
        return f"折线图已生成: {path}"
    except Exception as e:
        return f"折线图生成失败: {e}"

def _gen_bar_chart_sync(csv_data: str, x_col: str, y_col: str, title: str) -> str:
    try:
        from core.chart_engine import ChartEngine
        engine = ChartEngine()
        df = pd.read_csv(StringIO(csv_data))
        path = engine.generate_bar_chart(df, x_col, y_col, title)
        return f"柱状图已生成: {path}"
    except Exception as e:
        return f"柱状图生成失败: {e}"

generate_line_chart = StructuredTool.from_function(
    func=_gen_line_chart_sync,
    coroutine=lambda **kw: asyncio.to_thread(_gen_line_chart_sync, **kw),
    name="generate_line_chart",
    description="根据给定的 CSV 数据生成折线图并返回图片路径",
    args_schema=ChartArgs,
)

generate_bar_chart = StructuredTool.from_function(
    func=_gen_bar_chart_sync,
    coroutine=lambda **kw: asyncio.to_thread(_gen_bar_chart_sync, **kw),
    name="generate_bar_chart",
    description="根据给定的 CSV 数据生成柱状图并返回图片路径",
    args_schema=ChartArgs,
)
