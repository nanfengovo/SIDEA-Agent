"""RCS 连接器 Profile 存储。"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from infra.database import get_connection
from infra.config_store import ConfigStore


def ensure_rcs_schema(db_path: str = "config.db") -> None:
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rcs_connector_profile (
                profile_id     TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                base_url       TEXT NOT NULL,
                auth_type      TEXT NOT NULL DEFAULT 'bearer',
                auth_config    TEXT NOT NULL DEFAULT '{}',
                timeout_ms     INTEGER NOT NULL DEFAULT 15000,
                is_simulation  INTEGER NOT NULL DEFAULT 1,
                is_active      INTEGER NOT NULL DEFAULT 0,
                extra_headers  TEXT NOT NULL DEFAULT '{}',
                notes          TEXT DEFAULT '',
                created_at     TEXT DEFAULT (datetime('now','localtime')),
                updated_at     TEXT DEFAULT (datetime('now','localtime'))
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rcs_operation_binding (
                id              TEXT PRIMARY KEY,
                profile_id      TEXT NOT NULL,
                capability_id   TEXT NOT NULL,
                method          TEXT NOT NULL DEFAULT 'GET',
                path            TEXT NOT NULL,
                query_json      TEXT NOT NULL DEFAULT '{}',
                body_json       TEXT,
                headers_json    TEXT NOT NULL DEFAULT '{}',
                input_map_json  TEXT NOT NULL DEFAULT '{}',
                response_map_json TEXT NOT NULL DEFAULT '{}',
                success_when_json TEXT NOT NULL DEFAULT '{"http_status":[200]}',
                enabled         INTEGER NOT NULL DEFAULT 1,
                confirm_required INTEGER NOT NULL DEFAULT 0,
                risk_level_override TEXT,
                updated_at      TEXT DEFAULT (datetime('now','localtime')),
                UNIQUE(profile_id, capability_id),
                FOREIGN KEY(profile_id) REFERENCES rcs_connector_profile(profile_id) ON DELETE CASCADE
            );
            """
        )
        conn.commit()


def _row_to_profile(row) -> Dict[str, Any]:
    d = dict(row)
    for k in ("auth_config", "extra_headers"):
        try:
            d[k] = json.loads(d.get(k) or "{}")
        except Exception:
            d[k] = {}
    d["is_simulation"] = bool(d.get("is_simulation"))
    d["is_active"] = bool(d.get("is_active"))
    return d


def list_profiles(db_path: str = "config.db") -> List[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM rcs_connector_profile ORDER BY is_active DESC, name ASC"
        ).fetchall()
    return [_row_to_profile(r) for r in rows]


def get_profile(profile_id: str, db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM rcs_connector_profile WHERE profile_id = ?", (profile_id,)
        ).fetchone()
    return _row_to_profile(row) if row else None


def get_active_profile(db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM rcs_connector_profile WHERE is_active = 1 LIMIT 1"
        ).fetchone()
    if row:
        return _row_to_profile(row)
    # 兼容旧 sys_config
    return _legacy_profile_from_sys_config(db_path)


def _legacy_profile_from_sys_config(db_path: str) -> Optional[Dict[str, Any]]:
    try:
        store = ConfigStore(db_path)
        base = store.get("API_ABP_BASE_URL", "")
        if not base:
            return None
        return {
            "profile_id": "_legacy_sys_config",
            "name": "Legacy API_ABP_*",
            "base_url": base,
            "auth_type": store.get("API_AUTH_TYPE", "bearer") or "bearer",
            "auth_config": {"token": store.get("API_ABP_TOKEN", "") or ""},
            "timeout_ms": 15000,
            "is_simulation": True,
            "is_active": True,
            "extra_headers": {},
            "notes": "从 sys_config API_ABP_* 兼容读取",
        }
    except Exception:
        return None


def create_profile(data: Dict[str, Any], db_path: str = "config.db") -> Dict[str, Any]:
    ensure_rcs_schema(db_path)
    profile_id = data.get("profile_id") or uuid.uuid4().hex
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO rcs_connector_profile
            (profile_id, name, base_url, auth_type, auth_config, timeout_ms,
             is_simulation, is_active, extra_headers, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                data["name"],
                data["base_url"].rstrip("/"),
                data.get("auth_type") or "bearer",
                json.dumps(data.get("auth_config") or {}, ensure_ascii=False),
                int(data.get("timeout_ms") or 15000),
                1 if data.get("is_simulation", True) else 0,
                1 if data.get("is_active") else 0,
                json.dumps(data.get("extra_headers") or {}, ensure_ascii=False),
                data.get("notes") or "",
            ),
        )
        if data.get("is_active"):
            conn.execute(
                "UPDATE rcs_connector_profile SET is_active = 0 WHERE profile_id != ?",
                (profile_id,),
            )
        conn.commit()
    return get_profile(profile_id, db_path)  # type: ignore


def update_profile(profile_id: str, data: Dict[str, Any], db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    existing = get_profile(profile_id, db_path)
    if not existing:
        return None
    merged = {**existing, **data, "profile_id": profile_id}
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE rcs_connector_profile SET
                name = ?, base_url = ?, auth_type = ?, auth_config = ?,
                timeout_ms = ?, is_simulation = ?, extra_headers = ?, notes = ?,
                updated_at = datetime('now','localtime')
            WHERE profile_id = ?
            """,
            (
                merged["name"],
                str(merged["base_url"]).rstrip("/"),
                merged.get("auth_type") or "bearer",
                json.dumps(merged.get("auth_config") or {}, ensure_ascii=False),
                int(merged.get("timeout_ms") or 15000),
                1 if merged.get("is_simulation") else 0,
                json.dumps(merged.get("extra_headers") or {}, ensure_ascii=False),
                merged.get("notes") or "",
                profile_id,
            ),
        )
        conn.commit()
    return get_profile(profile_id, db_path)


def delete_profile(profile_id: str, db_path: str = "config.db") -> bool:
    ensure_rcs_schema(db_path)
    with get_connection(db_path) as conn:
        cur = conn.execute(
            "DELETE FROM rcs_connector_profile WHERE profile_id = ?", (profile_id,)
        )
        conn.execute(
            "DELETE FROM rcs_operation_binding WHERE profile_id = ?", (profile_id,)
        )
        conn.commit()
        return cur.rowcount > 0


def activate_profile(profile_id: str, db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    ensure_rcs_schema(db_path)
    if not get_profile(profile_id, db_path):
        return None
    with get_connection(db_path) as conn:
        conn.execute("UPDATE rcs_connector_profile SET is_active = 0")
        conn.execute(
            "UPDATE rcs_connector_profile SET is_active = 1, updated_at = datetime('now','localtime') WHERE profile_id = ?",
            (profile_id,),
        )
        conn.commit()
    return get_profile(profile_id, db_path)
