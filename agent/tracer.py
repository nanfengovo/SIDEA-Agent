import uuid
import json
from typing import Any, Dict, List, Optional
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("agent.tracer")

class StreamEventTracer(BaseCallbackHandler):
    """
    流式事件追踪器：
    捕获 LangGraph 执行中的大模型推理、工具调用等，并将它们放入一个异步队列，
    供 FastAPI 的 SSE 路由不断向前端推流，用于展现出带科技感的侧边思维链。
    """
    
    def __init__(self, queue: "asyncio.Queue" = None, loop=None):
        super().__init__()
        self.queue = queue
        self.loop = loop
        self.steps: List[Dict[str, Any]] = []
        self.current_tool_call_id = None
        
    def _put_event(self, event_type: str, data: Dict[str, Any]):
        event = {
            "id": uuid.uuid4().hex,
            "type": event_type,
            "data": data
        }
        self.steps.append(event)
        if self.queue and self.loop:
            self.loop.call_soon_threadsafe(self.queue.put_nowait, event)
                
    def on_llm_start(self, serialized: Dict[str, Any], prompts: List[str], **kwargs: Any) -> Any:
        self._put_event("llm_start", {"message": "模型开始思考..."})

    def on_llm_new_token(self, token: str, **kwargs: Any) -> Any:
        self._put_event("llm_token", {"token": token})

    def on_llm_end(self, response: Any, **kwargs: Any) -> Any:
        self._put_event("llm_end", {"message": "模型思考结束"})

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> Any:
        tool_name = serialized.get("name", "UnknownTool")
        self.current_tool_call_id = kwargs.get("run_id")
        self._put_event("tool_start", {
            "tool": tool_name,
            "input": input_str,
            "message": f"正在调用工具: {tool_name}"
        })

    def on_tool_end(self, output: str, **kwargs: Any) -> Any:
        self._put_event("tool_end", {
            "output": output,
            "message": "工具调用完成"
        })

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> Any:
        self._put_event("tool_error", {
            "error": str(error),
            "message": "工具执行发生异常"
        })
