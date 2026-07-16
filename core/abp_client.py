import httpx
from typing import Dict, Any, Optional
from infra.logging.structured_logger import get_structured_logger
from infra.resilience.retry import async_retry

logger = get_structured_logger("core.abp_client")

class AbpClient:
    """与 C# ABP 后端的 HTTP 通信客户端，内置重试和鉴权"""
    
    def __init__(self, base_url: str, token: str, auth_type: str = "bearer"):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.auth_type = auth_type
        
        headers = {}
        if token:
            if auth_type.lower() == "bearer":
                headers["Authorization"] = f"Bearer {token}"
            else:
                headers["Authorization"] = token
                
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=10.0
        )
    
    async def close(self):
        await self.client.aclose()

    @async_retry(max_retries=2, delay=1.0)
    async def get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        try:
            response = await self.client.get(endpoint, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"ABP GET {endpoint} HTTP Error", extra={"status": e.response.status_code, "text": e.response.text})
            raise
        except Exception as e:
            logger.error(f"ABP GET {endpoint} Error", extra={"error": str(e)})
            raise

    @async_retry(max_retries=1, delay=1.0)
    async def post(self, endpoint: str, json_data: Dict) -> Any:
        try:
            response = await self.client.post(endpoint, json=json_data)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"ABP POST {endpoint} HTTP Error", extra={"status": e.response.status_code, "text": e.response.text})
            raise
        except Exception as e:
            logger.error(f"ABP POST {endpoint} Error", extra={"error": str(e)})
            raise
