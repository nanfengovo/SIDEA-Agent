"""语义工具：稳定工具名 → invoke_capability。"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool

from .capabilities import CAPABILITIES, ARGS_SCHEMA, get_capability
from .http_adapter import AdapterError, invoke_capability, invoke_capability_sync


def _format_result(result: Dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, indent=2, default=str)


def _format_error(e: AdapterError) -> str:
    return json.dumps(e.as_dict(), ensure_ascii=False, indent=2, default=str)


def _make_tool(capability_id: str) -> StructuredTool:
    cap = get_capability(capability_id)
    assert cap is not None
    schema = ARGS_SCHEMA[capability_id]

    async def _acall(**kwargs) -> str:
        try:
            # 去掉 None，避免模板污染
            params = {k: v for k, v in kwargs.items() if v is not None}
            result = await invoke_capability(capability_id, params)
            return _format_result(result)
        except AdapterError as e:
            return _format_error(e)
        except Exception as e:
            return _format_error(AdapterError("internal", str(e)))

    def _call(**kwargs) -> str:
        try:
            params = {k: v for k, v in kwargs.items() if v is not None}
            result = invoke_capability_sync(capability_id, params)
            return _format_result(result)
        except AdapterError as e:
            return _format_error(e)
        except Exception as e:
            return _format_error(AdapterError("internal", str(e)))

    return StructuredTool.from_function(
        func=_call,
        coroutine=_acall,
        name=cap.tool_name,
        description=cap.description,
        args_schema=schema,
    )


def build_rcs_tools(capability_ids: Optional[List[str]] = None) -> List[StructuredTool]:
    ids = capability_ids or list(CAPABILITIES.keys())
    return [_make_tool(cid) for cid in ids if cid in CAPABILITIES]


# 懒加载单例 map
_RCS_TOOL_MAP: Optional[Dict[str, StructuredTool]] = None


def get_rcs_tool_map() -> Dict[str, StructuredTool]:
    global _RCS_TOOL_MAP
    if _RCS_TOOL_MAP is None:
        tools = build_rcs_tools()
        _RCS_TOOL_MAP = {t.name: t for t in tools}
    return _RCS_TOOL_MAP