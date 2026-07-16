import json
import asyncio
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from core.abp_client import AbpClient
from infra.config_store import ConfigStore

config_store = ConfigStore()

class PLCReadArgs(BaseModel):
    node_id: str = Field(description="PLC 节点 ID (如: ns=2;s=Device1.Status)")

class PLCWriteArgs(BaseModel):
    node_id: str = Field(description="PLC 节点 ID")
    value: str = Field(description="要写入的值 (将被序列化)")
    value_type: str = Field(description="值类型，如 Int16, Boolean, String")

def _get_client():
    base_url = config_store.get("API_ABP_BASE_URL", "http://localhost:5000")
    token = config_store.get("API_ABP_TOKEN", "")
    auth_type = config_store.get("API_AUTH_TYPE", "bearer")
    return AbpClient(base_url, token, auth_type)

async def _plc_read_async(node_id: str) -> str:
    client = _get_client()
    try:
        res = await client.get("/api/app/plc/read-node", params={"nodeId": node_id})
        return f"读取节点 {node_id} 成功，值: {json.dumps(res, ensure_ascii=False)}"
    except Exception as e:
        return f"读取节点 {node_id} 失败: {e}"
    finally:
        await client.close()

def _plc_read_sync(node_id: str) -> str:
    return asyncio.run(_plc_read_async(node_id))

plc_read = StructuredTool.from_function(
    func=_plc_read_sync,
    coroutine=_plc_read_async,
    name="plc_read",
    description="读取指定的 PLC 节点值（通过调用 C# ABP 接口）",
    args_schema=PLCReadArgs,
)

async def _plc_write_async(node_id: str, value: str, value_type: str) -> str:
    client = _get_client()
    try:
        payload = {"nodeId": node_id, "value": value, "valueType": value_type}
        res = await client.post("/api/app/plc/write-node", json_data=payload)
        return f"向节点 {node_id} 写入成功，响应: {json.dumps(res, ensure_ascii=False)}"
    except Exception as e:
        return f"写入节点 {node_id} 失败: {e}"
    finally:
        await client.close()

def _plc_write_sync(node_id: str, value: str, value_type: str) -> str:
    return asyncio.run(_plc_write_async(node_id, value, value_type))

plc_write = StructuredTool.from_function(
    func=_plc_write_sync,
    coroutine=_plc_write_async,
    name="plc_write",
    description="向指定的 PLC 节点写入值（通过调用 C# ABP 接口）",
    args_schema=PLCWriteArgs,
)
