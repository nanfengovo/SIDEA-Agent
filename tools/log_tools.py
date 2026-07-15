from langchain_core.tools import tool
from pydantic import BaseModel, Field

# 定义参数效验模型
class PLCLogRequest(BaseModel):
    time_range: str = Field(description="查询的时间范围，比如‘今天’，‘最近一小时’")
    device_id: str = Field(default="ALL", description="设备ID，如果没有指定则为 ALL")

@tool(args_schema=PLCLogRequest)
def read_plc_log(time_range: str, device_id: str) -> str:
    """读取并分析 PLC 控制器的报警和过载日志。当用户询问机器停机、故障原因时使用"""
    print(f"[Tool Executed] 查询PLC日志: 时间={time_range}, 设备={device_id}")
    return f"找到了 {time_range} 的 {device_id} 日志：发生过 3 次电机过载停机异常。"