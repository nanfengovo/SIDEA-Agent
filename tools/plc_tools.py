"""PLC 读写工具：委托可配置 RCS 适配层（兼容旧工具名 plc_read / plc_write）。"""
from __future__ import annotations

import json
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from integrations.rcs.http_adapter import AdapterError, invoke_capability, invoke_capability_sync


class PLCReadArgs(BaseModel):
    node_id: str = Field(description="PLC 标签名 / 节点名（映射到 RCS TagName）")


class PLCWriteArgs(BaseModel):
    node_id: str = Field(description="PLC 标签名 / 节点名")
    value: str = Field(description="要写入的值")
    value_type: str = Field(default="String", description="值类型（兼容旧参数，实际由 RCS Tag 配置决定）")


async def _plc_read_async(node_id: str) -> str:
    try:
        result = await invoke_capability("plc.read", {"tag_name": node_id})
        return json.dumps(result, ensure_ascii=False, indent=2, default=str)
    except AdapterError as e:
        return json.dumps(e.as_dict(), ensure_ascii=False, indent=2)
    except Exception as e:
        return f"读取节点 {node_id} 失败: {e}"


def _plc_read_sync(node_id: str) -> str:
    try:
        result = invoke_capability_sync("plc.read", {"tag_name": node_id})
        return json.dumps(result, ensure_ascii=False, indent=2, default=str)
    except AdapterError as e:
        return json.dumps(e.as_dict(), ensure_ascii=False, indent=2)
    except Exception as e:
        return f"读取节点 {node_id} 失败: {e}"


plc_read = StructuredTool.from_function(
    func=_plc_read_sync,
    coroutine=_plc_read_async,
    name="plc_read",
    description="读取指定的 PLC 标签值（通过可配置 RCS 连接器，能力 plc.read）",
    args_schema=PLCReadArgs,
)


async def _plc_write_async(node_id: str, value: str, value_type: str = "String") -> str:
    try:
        result = await invoke_capability("plc.write", {"tag_name": node_id, "value": value})
        return json.dumps(result, ensure_ascii=False, indent=2, default=str)
    except AdapterError as e:
        return json.dumps(e.as_dict(), ensure_ascii=False, indent=2)
    except Exception as e:
        return f"写入节点 {node_id} 失败: {e}"


def _plc_write_sync(node_id: str, value: str, value_type: str = "String") -> str:
    try:
        result = invoke_capability_sync("plc.write", {"tag_name": node_id, "value": value})
        return json.dumps(result, ensure_ascii=False, indent=2, default=str)
    except AdapterError as e:
        return json.dumps(e.as_dict(), ensure_ascii=False, indent=2)
    except Exception as e:
        return f"写入节点 {node_id} 失败: {e}"


plc_write = StructuredTool.from_function(
    func=_plc_write_sync,
    coroutine=_plc_write_async,
    name="plc_write",
    description="向指定的 PLC 标签写入值（通过可配置 RCS 连接器，能力 plc.write；高风险）",
    args_schema=PLCWriteArgs,
)
