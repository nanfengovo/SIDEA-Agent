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

from typing import Any

class EchartsI18nArgs(BaseModel):
    data_summary: Any = Field(description="传递给前端渲染的数据摘要，可以是字符串、列表或字典。")
    instructions: str = Field(description="图表绘制说明，例如需要绘制什么图，X轴Y轴分别是什么等。")

def _render_echarts_i18n_sync(data_summary: Any, instructions: str) -> str:
    return f"""
    [系统指令] 请勿编写任何代码。用户要求生成交互式图表。
    请务必在你的最终回答的**最末尾新起一行**，输出一段符合以下 JSON 规范的 markdown 代码块 (必须以 ```echarts-i18n 开头，以 ``` 结尾)：
    {{
       "i18n": {{
           "zh-CN": {{ "T_TITLE": "图表标题", "T_X": "X轴名", "T_LEGEND": "图例" }},
           "en": {{ "T_TITLE": "Chart Title", "T_X": "X Axis", "T_LEGEND": "Legend" }}
       }},
       "option": {{
           "title": {{"text": "T_TITLE"}},
           ... 标准的 Echarts option 配置 ...
       }}
    }}
    要求：
    1. 必须单独成段，前面一定要有换行符！
    2. JSON 内部绝对不可以出现任何注释 (// 或 /*)，否则会导致解析失败！
    3. i18n 节点必须包含 zh-CN 和 en 两种语言。
    4. option 节点中【任何】需要被展示的文本(如 title, xAxis.name, legend.data, radar.indicator 的 name 等)，【必须】使用你在 i18n 节点中定义的翻译占位符(如 T_TITLE)，绝对不能在 option 里写死中文或英文！
    5. 基于给定的数据摘要：{data_summary}，和指令：{instructions}。
    """

render_echarts_i18n = StructuredTool.from_function(
    func=_render_echarts_i18n_sync,
    coroutine=lambda **kw: asyncio.to_thread(_render_echarts_i18n_sync, **kw),
    name="render_echarts_i18n",
    description="用来在前端直接渲染原生多语言交互式 Web Echarts 图表。返回指导你如何输出对应 Markdown 的指令。",
    args_schema=EchartsI18nArgs,
)
