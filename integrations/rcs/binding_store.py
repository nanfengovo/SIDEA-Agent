"""RCS 操作绑定存储（能力 → HTTP）。"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from infra.database import get_connection
from .profile_store import ensure_rcs_schema, get_profile


def _row_to_binding(row) -> Dict[str, Any]:
    d = dict(row)
    for k, default in (
        ("query_json", "{}"),
        ("headers_json", "{}"),
        ("input_map_json", "{}"),
        ("response_map_json", "{}"),
        ("success_when_json", '{"http_status":[200]}'),
    ):
        raw = d.pop(k, default)
        out_key = k.replace("_json", "") if k.endswith("_json") else k
        # normalize keys: query, body, headers, input_map, response_map, success_when
        if k == "query_json":
            out_key = "query"
        elif k == "headers_json":
            out_key = "headers"
        elif k == "input_map_json":
            out_key = "input_map"
        elif k == "response_map_json":
            out_key = "response_map"
        elif k == "success_when_json":
            out_key = "success_when"
        try:
            d[out_key] = json.loads(raw or default)
        except Exception:
            d[out_key] = json.loads(default)
    body_raw = d.pop("body_json", None)
    if body_raw:
        try:
            d["body"] = json.loads(body_raw)
        except Exception:
            d["body"] = body_raw
    else:
        d["body"] = None
    d["enabled"] = bool(d.get("enabled"))
    d["confirm_required"] = bool(d.get("confirm_required"))
    return d


def list_bindings(profile_id: str, db_path: str = "config.db") -> List[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM rcs_operation_binding WHERE profile_id = ? ORDER BY capability_id",
            (profile_id,),
        ).fetchall()
    return [_row_to_binding(r) for r in rows]


def get_binding(
    profile_id: str, capability_id: str, db_path: str = "config.db"
) -> Optional[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            """
            SELECT * FROM rcs_operation_binding
            WHERE profile_id = ? AND capability_id = ? AND enabled = 1
            """,
            (profile_id, capability_id),
        ).fetchone()
    return _row_to_binding(row) if row else None


def upsert_binding(profile_id: str, binding: Dict[str, Any], db_path: str = "config.db") -> Dict[str, Any]:
    ensure_rcs_schema(db_path)
    cap = binding["capability_id"]
    bid = binding.get("id") or uuid.uuid4().hex
    with get_connection(db_path) as conn:
        existing = conn.execute(
            "SELECT id FROM rcs_operation_binding WHERE profile_id = ? AND capability_id = ?",
            (profile_id, cap),
        ).fetchone()
        body = binding.get("body")
        body_json = json.dumps(body, ensure_ascii=False) if body is not None else None
        params = (
            binding.get("method") or "GET",
            binding["path"],
            json.dumps(binding.get("query") or {}, ensure_ascii=False),
            body_json,
            json.dumps(binding.get("headers") or {}, ensure_ascii=False),
            json.dumps(binding.get("input_map") or {}, ensure_ascii=False),
            json.dumps(binding.get("response_map") or {}, ensure_ascii=False),
            json.dumps(binding.get("success_when") or {"http_status": [200]}, ensure_ascii=False),
            1 if binding.get("enabled", True) else 0,
            1 if binding.get("confirm_required") else 0,
            binding.get("risk_level_override"),
        )
        if existing:
            bid = existing["id"]
            conn.execute(
                """
                UPDATE rcs_operation_binding SET
                    method=?, path=?, query_json=?, body_json=?, headers_json=?,
                    input_map_json=?, response_map_json=?, success_when_json=?,
                    enabled=?, confirm_required=?, risk_level_override=?,
                    updated_at=datetime('now','localtime')
                WHERE id=?
                """,
                params + (bid,),
            )
        else:
            conn.execute(
                """
                INSERT INTO rcs_operation_binding
                (id, profile_id, capability_id, method, path, query_json, body_json,
                 headers_json, input_map_json, response_map_json, success_when_json,
                 enabled, confirm_required, risk_level_override)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (bid, profile_id, cap) + params,
            )
        conn.commit()
    return get_binding(profile_id, cap, db_path) or {}


def replace_bindings(
    profile_id: str, bindings: List[Dict[str, Any]], db_path: str = "config.db"
) -> List[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        conn.execute(
            "DELETE FROM rcs_operation_binding WHERE profile_id = ?", (profile_id,)
        )
        conn.commit()
    out = []
    for b in bindings:
        out.append(upsert_binding(profile_id, b, db_path))
    return out


def export_profile_pack(profile_id: str, db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    profile = get_profile(profile_id, db_path)
    if not profile:
        return None
    # 导出时去掉敏感 token 可选：保留结构，token 置空标记
    auth = dict(profile.get("auth_config") or {})
    if auth.get("token"):
        auth["token"] = "***"
    if auth.get("password"):
        auth["password"] = "***"
    return {
        "version": 1,
        "profile": {
            **{k: v for k, v in profile.items() if k != "auth_config"},
            "auth_config": auth,
            "is_active": False,
        },
        "bindings": list_bindings(profile_id, db_path),
    }


def import_profile_pack(
    pack: Dict[str, Any],
    db_path: str = "config.db",
    activate: bool = False,
) -> Dict[str, Any]:
    from .profile_store import create_profile, activate_profile, update_profile

    ensure_rcs_schema(db_path)
    p = dict(pack.get("profile") or {})
    p.pop("is_active", None)
    p["profile_id"] = p.get("profile_id") or uuid.uuid4().hex
    # 若同 id 已存在则更新
    existing = get_profile(p["profile_id"], db_path)
    if existing:
        update_profile(p["profile_id"], p, db_path)
        profile = get_profile(p["profile_id"], db_path)
    else:
        profile = create_profile(p, db_path)
    bindings = pack.get("bindings") or []
    replace_bindings(profile["profile_id"], bindings, db_path)
    if activate:
        activate_profile(profile["profile_id"], db_path)
        profile = get_profile(profile["profile_id"], db_path)
    return {
        "profile": profile,
        "bindings": list_bindings(profile["profile_id"], db_path),
    }
