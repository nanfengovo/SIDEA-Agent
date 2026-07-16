import json
import asyncio
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from core.abp_client import AbpClient
from infra.config_store import ConfigStore

config_store = ConfigStore()

class RestApiArgs(BaseModel):
    endpoint: str = Field(description="API 端点 (如 /api/app/device/status)")
    method: str = Field(description="GET 或 POST")
    payload: str = Field(description="JSON 格式的请求体或查询参数", default="{}")

def _get_client():
    base_url = config_store.get("API_ABP_BASE_URL", "http://localhost:5000")
    token = config_store.get("API_ABP_TOKEN", "")
    auth_type = config_store.get("API_AUTH_TYPE", "bearer")
    return AbpClient(base_url, token, auth_type)

async def _abp_rest_api_async(endpoint: str, method: str, payload: str) -> str:
    client = _get_client()
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return "payload 解析失败，必须是合法的 JSON 字符串。"

    try:
        if method.upper() == "GET":
            res = await client.get(endpoint, params=data)
        elif method.upper() == "POST":
            res = await client.post(endpoint, json_data=data)
        else:
            return f"不支持的方法: {method}"
        return json.dumps(res, ensure_ascii=False)
    except Exception as e:
        return f"接口调用失败: {e}"
    finally:
        await client.close()

def _abp_rest_api_sync(endpoint: str, method: str, payload: str) -> str:
    return asyncio.run(_abp_rest_api_async(endpoint, method, payload))

abp_rest_api = StructuredTool.from_function(
    func=_abp_rest_api_sync,
    coroutine=_abp_rest_api_async,
    name="abp_rest_api",
    description="调用 C# ABP 业务后端的 RESTful 接口获取或操作业务数据。",
    args_schema=RestApiArgs,
)
