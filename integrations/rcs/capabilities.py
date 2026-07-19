"""稳定语义能力目录（代码内置，不随 RCS 项目变化）。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CapabilityDef(BaseModel):
    id: str
    tool_name: str
    description: str
    risk_level: str = "read"  # read | write | dangerous
    input_fields: Dict[str, str] = Field(default_factory=dict)


class PlcReadArgs(BaseModel):
    tag_name: str = Field(..., description="PLC 标签名（语义名，非原始地址）")


class PlcWriteArgs(BaseModel):
    tag_name: str = Field(..., description="PLC 标签名")
    value: str = Field(..., description="要写入的值")


class TaskListArgs(BaseModel):
    status: Optional[str] = Field(None, description="可选状态过滤")
    limit: int = Field(50, description="返回条数上限")


class TaskDetailArgs(BaseModel):
    task_id: str = Field(..., description="任务 ID")


class TaskCancelArgs(BaseModel):
    task_id: str = Field(..., description="要取消的任务 ID")


class AgvStatusArgs(BaseModel):
    limit: int = Field(50, description="返回条数上限")


class AlarmListArgs(BaseModel):
    limit: int = Field(50, description="返回条数上限")


class LogQueryArgs(BaseModel):
    limit: int = Field(30, description="返回条数上限")
    keyword: Optional[str] = Field(None, description="可选关键词过滤")


class MapSnapshotArgs(BaseModel):
    include_paths: bool = Field(True, description="是否包含路径")


CAPABILITIES: Dict[str, CapabilityDef] = {
    "plc.read": CapabilityDef(
        id="plc.read",
        tool_name="rcs_plc_read",
        description="读取 RCS 配置的 PLC 标签当前值",
        risk_level="read",
        input_fields={"tag_name": "string"},
    ),
    "plc.write": CapabilityDef(
        id="plc.write",
        tool_name="rcs_plc_write",
        description="向 RCS 配置的 PLC 标签写入值（高风险，需审批）",
        risk_level="write",
        input_fields={"tag_name": "string", "value": "string"},
    ),
    "task.list": CapabilityDef(
        id="task.list",
        tool_name="fetch_task_stats",
        description="查询 RCS 任务列表/统计（吞吐、状态分布）",
        risk_level="read",
        input_fields={"status": "string?", "limit": "int"},
    ),
    "task.detail": CapabilityDef(
        id="task.detail",
        tool_name="rcs_task_detail",
        description="查询单个任务详情与监控时间线",
        risk_level="read",
        input_fields={"task_id": "string"},
    ),
    "task.cancel": CapabilityDef(
        id="task.cancel",
        tool_name="rcs_task_cancel",
        description="取消 RCS 任务（危险操作，需审批）",
        risk_level="dangerous",
        input_fields={"task_id": "string"},
    ),
    "agv.status": CapabilityDef(
        id="agv.status",
        tool_name="fetch_agv_status",
        description="查询 AMR/AGV 车队或 TM 任务状态",
        risk_level="read",
        input_fields={"limit": "int"},
    ),
    "alarm.list": CapabilityDef(
        id="alarm.list",
        tool_name="fetch_alarms",
        description="查询报警/库位不一致等告警列表",
        risk_level="read",
        input_fields={"limit": "int"},
    ),
    "log.plc": CapabilityDef(
        id="log.plc",
        tool_name="rcs_plc_interaction_log",
        description="查询 RCS 侧 PLC 交互日志",
        risk_level="read",
        input_fields={"limit": "int", "keyword": "string?"},
    ),
    "log.third_party": CapabilityDef(
        id="log.third_party",
        tool_name="rcs_third_party_log",
        description="查询 RCS 第三方调用日志（AMA/TM/STK/WIN）",
        risk_level="read",
        input_fields={"limit": "int", "keyword": "string?"},
    ),
    "map.snapshot": CapabilityDef(
        id="map.snapshot",
        tool_name="rcs_map_snapshot",
        description="获取 AGV/厂区地图快照点位数据（若项目提供）",
        risk_level="read",
        input_fields={"include_paths": "bool"},
    ),
}

ARGS_SCHEMA: Dict[str, type] = {
    "plc.read": PlcReadArgs,
    "plc.write": PlcWriteArgs,
    "task.list": TaskListArgs,
    "task.detail": TaskDetailArgs,
    "task.cancel": TaskCancelArgs,
    "agv.status": AgvStatusArgs,
    "alarm.list": AlarmListArgs,
    "log.plc": LogQueryArgs,
    "log.third_party": LogQueryArgs,
    "map.snapshot": MapSnapshotArgs,
}


def get_capability(capability_id: str) -> Optional[CapabilityDef]:
    return CAPABILITIES.get(capability_id)


def list_capability_ids() -> List[str]:
    return list(CAPABILITIES.keys())


def capability_catalog() -> List[Dict[str, Any]]:
    return [c.model_dump() for c in CAPABILITIES.values()]
