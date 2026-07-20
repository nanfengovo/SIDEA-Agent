import json

from infra.database import get_connection
from tools.log_tools import read_plc_log
from tools.dashboard_tools import (
    list_dashboard_templates,
    recommend_dashboard_template,
    render_dashboard_tool,
    get_dashboard_stats,
)

_AGENT_ROLE_CACHE = {}
_AGENT_TOOL_CACHE = {
    "read_plc_log": read_plc_log,
    "list_dashboard_templates": list_dashboard_templates,
    "recommend_dashboard_template": recommend_dashboard_template,
    "render_dashboard": render_dashboard_tool,
    "get_dashboard_stats": get_dashboard_stats,
}

# 根据前端选择的role加载该角色拥有权限的工具
def get_role_info(role_name:str)->dict:
    """
    获取角色的信息
    :param role_name: 角色名称
    :return: 该角色的相关数据
    """
    if role_name in _AGENT_ROLE_CACHE:
        return _AGENT_ROLE_CACHE[role_name]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""SELECT * FROM agent_roles WHERE role_name = ?""" , (role_name,))
        row = cursor.fetchone()
        if row is not None:
            _AGENT_ROLE_CACHE[role_name] = row
            return row
        else:
            return None

# 根据已有的工具加载需要的工具
def get_tool_for_role(role_name:str)->list:
    """
    获取大模型在这里可以调用的工具
    :param role_name:角色名
    :return:工具集
    """
    agent_role = get_role_info(role_name)
    if agent_role is None:
        raise ValueError(f"数据库中没有这个角色: {role_name}")
    tool_name_str = agent_role["bound_tools"]
    tool_name = json.loads(tool_name_str)

    active_tool = []
    for tool in tool_name:
        if tool in _AGENT_TOOL_CACHE:
            active_tool.append(_AGENT_TOOL_CACHE[tool])

        else:
            print(f"警告: 数据库中配置了工具 {tool}，但代码里没注册。")
    return active_tool

if __name__ == "__main__":
    # 你可以在文件最后加上这段测一下
    tools = get_tool_for_role("PLC 故障诊断专家")
    print(tools)
    # 如果打印出来类似 [<langchain_core.tools.StructuredTool object...>] 就说明彻底成功了！