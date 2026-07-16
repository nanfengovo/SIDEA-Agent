from enum import Enum
from fastapi import Depends
from infra.auth.jwt_handler import AuthorizationError

class Role(str, Enum):
    ADMIN = "admin"         # 可修改配置和 Skill
    OPERATOR = "operator"   # 可使用诊断功能
    VIEWER = "viewer"       # 只能查看报告

def require_role(*allowed_roles: Role):
    """
    返回一个 FastAPI 依赖项，检查当前用户角色是否在允许列表中。
    Phase 1 先做骨架，直接 pass 不校验，后续补逻辑。
    """
    async def role_checker():
        # TODO: Get current user from request and check role
        # current_role = request.state.user.role
        # if current_role not in allowed_roles:
        #     raise AuthorizationError("Insufficient permissions")
        pass
    return role_checker
