import jwt
from datetime import datetime, timedelta
from typing import Dict, Any

class AuthenticationError(Exception):
    pass

class AuthorizationError(Exception):
    pass

class JWTHandler:
    def __init__(self, secret: str, algorithm: str = "HS256"):
        self.secret = secret
        self.algorithm = algorithm
    
    def create_token(self, user_id: str, role: str, expires_hours: int = 24) -> str:
        """
        payload 至少包含:
        - sub: user_id
        - role: 角色
        - exp: 过期时间
        - iat: 签发时间
        """
        now = datetime.utcnow()
        payload = {
            "sub": user_id,
            "role": role,
            "iat": now,
            "exp": now + timedelta(hours=expires_hours)
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """
        验证成功返回 payload dict
        验证失败抛出自定义 AuthenticationError
        """
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise AuthenticationError("Token has expired")
        except jwt.InvalidTokenError:
            raise AuthenticationError("Invalid token")
