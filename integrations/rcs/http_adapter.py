"""可配置 HTTP 适配器：模板渲染、鉴权、响应映射。"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, Optional, Tuple

import httpx

from infra.logging.structured_logger import get_structured_logger
from .capabilities import get_capability
from .profile_store import get_active_profile, get_profile
from .binding_store import get_binding

logger = get_structured_logger("integrations.rcs.adapter")

_TOKEN_CACHE: Dict[str, Tuple[str, float]] = {}
_VAR = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


class AdapterError(Exception):
    def __init__(self, code: str, message: str, detail: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail

    def as_dict(self) -> Dict[str, Any]:
        return {"ok": False, "error": self.code, "message": self.message, "detail": self.detail}


def _render(obj: Any, vars_: Dict[str, Any]) -> Any:
    if isinstance(obj, str):
        def repl(m):
            key = m.group(1)
            if key not in vars_ or vars_[key] is None:
                return ""
            return str(vars_[key])

        return _VAR.sub(repl, obj)
    if isinstance(obj, list):
        return [_render(x, vars_) for x in obj]
    if isinstance(obj, dict):
        return {k: _render(v, vars_) for k, v in obj.items()}
    return obj


def _extract_path(data: Any, path: str) -> Any:
    """简易路径：`$` 整包；`$.a.b` / `a.b`；`$.items[0].id`。"""
    if not path or path == "$":
        return data
    p = path[2:] if path.startswith("$.") else (path[1:] if path.startswith("$") else path)
    cur = data
    for part in p.split("."):
        if not part:
            continue
        m = re.match(r"^([a-zA-Z0-9_]+)\[(\d+)\]$", part)
        if m:
            key, idx = m.group(1), int(m.group(2))
            if not isinstance(cur, dict) or key not in cur:
                return None
            cur = cur[key]
            if not isinstance(cur, list) or idx >= len(cur):
                return None
            cur = cur[idx]
        else:
            if isinstance(cur, dict):
                cur = cur.get(part)
            else:
                return None
    return cur


def _map_response(raw: Any, response_map: Dict[str, str]) -> Dict[str, Any]:
    if not response_map:
        return {"data": raw}
    out: Dict[str, Any] = {}
    for key, path in response_map.items():
        out[key] = _extract_path(raw, path)
    return out


async def _resolve_auth_headers(profile: Dict[str, Any]) -> Dict[str, str]:
    auth_type = (profile.get("auth_type") or "bearer").lower()
    cfg = profile.get("auth_config") or {}
    headers = dict(profile.get("extra_headers") or {})

    if auth_type in ("none", ""):
        return headers

    if auth_type == "bearer":
        token = cfg.get("token") or ""
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    if auth_type == "openid_password":
        token = await _fetch_openid_token(profile)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    # 其它：原样 token
    token = cfg.get("token") or ""
    if token:
        headers["Authorization"] = token
    return headers


async def _fetch_openid_token(profile: Dict[str, Any]) -> str:
    cfg = profile.get("auth_config") or {}
    cache_key = profile.get("profile_id") or profile.get("base_url")
    cached = _TOKEN_CACHE.get(cache_key or "")
    if cached and cached[1] > time.time():
        return cached[0]

    token_url = cfg.get("token_url") or f"{profile['base_url'].rstrip('/')}/connect/token"
    data = {
        "grant_type": "password",
        "client_id": cfg.get("client_id") or "Erack_RCS_API_Password",
        "username": cfg.get("username") or "",
        "password": cfg.get("password") or "",
        "scope": cfg.get("scope") or "Erack_RCS_API",
    }
    if cfg.get("client_secret"):
        data["client_secret"] = cfg["client_secret"]

    timeout = (profile.get("timeout_ms") or 15000) / 1000.0
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(token_url, data=data)
        resp.raise_for_status()
        payload = resp.json()
        token = payload.get("access_token") or ""
        expires = int(payload.get("expires_in") or 300)
        _TOKEN_CACHE[cache_key or ""] = (token, time.time() + max(30, expires - 30))
        return token


async def invoke_capability(
    capability_id: str,
    params: Dict[str, Any],
    *,
    profile_id: Optional[str] = None,
    db_path: str = "config.db",
) -> Dict[str, Any]:
    """执行语义能力；返回规范化结果 dict。"""
    cap = get_capability(capability_id)
    if not cap:
        raise AdapterError("unknown_capability", f"未知能力: {capability_id}")

    profile = get_profile(profile_id, db_path) if profile_id else get_active_profile(db_path)
    if not profile:
        raise AdapterError(
            "no_profile",
            "未配置激活的 RCS 连接器。请到管理后台 → RCS 连接器 创建并激活 Profile。",
        )

    if profile.get("profile_id") == "_legacy_sys_config":
        # 兼容模式：仅允许通过旧工具路径，仍尝试绑定表；无绑定则报错引导
        pass

    pid = profile["profile_id"]
    if pid == "_legacy_sys_config":
        raise AdapterError(
            "legacy_only",
            "当前仅有旧版 API_ABP_* 配置。请导入/激活正式 RCS Profile 后再调用语义能力。",
        )

    binding = get_binding(pid, capability_id, db_path)
    if not binding:
        raise AdapterError(
            "not_bound",
            f"能力 `{capability_id}` 在当前 Profile「{profile.get('name')}」未绑定 HTTP 接口。"
            "请在管理后台完成操作绑定。",
            {"capability_id": capability_id, "profile_id": pid},
        )

    vars_ = dict(params or {})
    method = (binding.get("method") or "GET").upper()
    path = _render(binding.get("path") or "", vars_)
    query = _render(binding.get("query") or {}, vars_)
    body = _render(binding.get("body"), vars_) if binding.get("body") is not None else None
    extra_headers = _render(binding.get("headers") or {}, vars_)

    auth_headers = await _resolve_auth_headers(profile)
    headers = {**auth_headers, **extra_headers}
    if body is not None and "Content-Type" not in headers:
        headers["Content-Type"] = "application/json"

    url_path = path if path.startswith("/") else f"/{path}"
    base = profile["base_url"].rstrip("/")
    timeout = (profile.get("timeout_ms") or 15000) / 1000.0
    started = time.time()

    try:
        async with httpx.AsyncClient(base_url=base, headers=headers, timeout=timeout) as client:
            if method in ("GET", "DELETE"):
                resp = await client.request(method, url_path, params=query or None)
            else:
                resp = await client.request(
                    method,
                    url_path,
                    params=query or None,
                    json=body if isinstance(body, (dict, list)) else None,
                    content=None if isinstance(body, (dict, list)) else (body if body is not None else None),
                )
    except httpx.HTTPError as e:
        logger.error(f"RCS invoke network error: {capability_id}", extra={"error": str(e)})
        raise AdapterError("network", f"调用 RCS 失败: {e}")

    elapsed_ms = int((time.time() - started) * 1000)
    success_when = binding.get("success_when") or {"http_status": [200]}
    ok_status = success_when.get("http_status") or [200]
    if resp.status_code not in ok_status:
        raise AdapterError(
            "http_error",
            f"RCS 返回 HTTP {resp.status_code}",
            {"status": resp.status_code, "body": resp.text[:2000], "elapsed_ms": elapsed_ms},
        )

    try:
        raw = resp.json()
    except Exception:
        raw = {"text": resp.text}

    mapped = _map_response(raw, binding.get("response_map") or {})
    return {
        "ok": True,
        "capability_id": capability_id,
        "profile_id": pid,
        "profile_name": profile.get("name"),
        "is_simulation": bool(profile.get("is_simulation")),
        "elapsed_ms": elapsed_ms,
        "risk_level": binding.get("risk_level_override") or cap.risk_level,
        "data": mapped,
        "raw": raw,
    }


def invoke_capability_sync(
    capability_id: str,
    params: Dict[str, Any],
    *,
    profile_id: Optional[str] = None,
    db_path: str = "config.db",
) -> Dict[str, Any]:
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        # 在已有事件循环中：开新线程跑
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(
                lambda: asyncio.run(
                    invoke_capability(capability_id, params, profile_id=profile_id, db_path=db_path)
                )
            )
            return fut.result()
    return asyncio.run(
        invoke_capability(capability_id, params, profile_id=profile_id, db_path=db_path)
    )
