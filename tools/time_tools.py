from langchain_core.tools import tool
from datetime import datetime
import platform

@tool("get_current_time")
def get_current_time() -> str:
    """
    获取当前系统的精确日期和时间信息。
    当对话中涉及"今天"、"现在"、"当前时间"、"今天是几号"、"最新"等时间敏感概念时，
    必须先调用此工具确认真实时间，不得依赖训练数据中的时间假设。
    """
    now = datetime.now()
    weekday_map = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    weekday = weekday_map[now.weekday()]
    return (
        f"当前系统时间:\n"
        f"  日期: {now.strftime('%Y-%m-%d')} ({weekday})\n"
        f"  时间: {now.strftime('%H:%M:%S')}\n"
        f"  时间戳: {int(now.timestamp())}\n"
        f"  ISO格式: {now.isoformat()}"
    )
