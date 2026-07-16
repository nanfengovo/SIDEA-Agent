from fastapi import APIRouter
from skills.registry import TOOL_MAP

router = APIRouter()

@router.get("/admin/tools")
def get_all_tools():
    result = []
    for tname, func in TOOL_MAP.items():
        # func might be a LangChain StructuredTool or similar object
        # which has name and description properties
        desc = ""
        name = tname
        if hasattr(func, "name"):
            name = func.name
        if hasattr(func, "description"):
            desc = func.description
        elif hasattr(func, "__doc__") and func.__doc__:
            desc = func.__doc__.strip().split("\\n")[0]
            
        result.append({
            "name": name,
            "description": desc,
            "key": tname
        })
    return result
