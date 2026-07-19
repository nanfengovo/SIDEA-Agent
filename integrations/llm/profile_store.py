"""LLM Provider Profile 存储：多 Profile + 单 Active。"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from infra.config_store import ConfigStore
from infra.database import get_connection

VALID_PROVIDERS = ("ollama", "openai", "openai_compatible", "gemini_native")


def ensure_llm_schema(db_path: str = "config.db") -> None:
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_provider_profile (
                profile_id     TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                provider       TEXT NOT NULL,
                base_url       TEXT NOT NULL DEFAULT '',
                api_key        TEXT NOT NULL DEFAULT '',
                model_name     TEXT NOT NULL,
                temperature    REAL NOT NULL DEFAULT 0.1,
                max_tokens     INTEGER,
                extra_config   TEXT NOT NULL DEFAULT '{}',
                is_enabled     INTEGER NOT NULL DEFAULT 1,
                is_active      INTEGER NOT NULL DEFAULT 0,
                notes          TEXT DEFAULT '',
                created_at     TEXT DEFAULT (datetime('now','localtime')),
                updated_at     TEXT DEFAULT (datetime('now','localtime'))
            );
            """
        )
        conn.commit()


def _row_to_profile(row, *, mask_key: bool = False) -> Dict[str, Any]:
    d = dict(row)
    try:
        d["extra_config"] = json.loads(d.get("extra_config") or "{}")
    except Exception:
        d["extra_config"] = {}
    d["is_enabled"] = bool(d.get("is_enabled"))
    d["is_active"] = bool(d.get("is_active"))
    d["temperature"] = float(d.get("temperature") or 0.1)
    if d.get("max_tokens") is not None:
        try:
            d["max_tokens"] = int(d["max_tokens"])
        except (TypeError, ValueError):
            d["max_tokens"] = None
    if mask_key and d.get("api_key"):
        key = str(d["api_key"])
        d["api_key_set"] = True
        d["api_key"] = f"{key[:6]}••••{key[-4:]}" if len(key) > 8 else "••••••••"
    else:
        d["api_key_set"] = bool(d.get("api_key"))
    return d


def list_profiles(
    db_path: str = "config.db",
    *,
    enabled_only: bool = False,
    mask_key: bool = True,
) -> List[Dict[str, Any]]:
    ensure_llm_schema(db_path)
    with get_connection(db_path) as conn:
        if enabled_only:
            rows = conn.execute(
                "SELECT * FROM llm_provider_profile WHERE is_enabled = 1 "
                "ORDER BY is_active DESC, name ASC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM llm_provider_profile ORDER BY is_active DESC, name ASC"
            ).fetchall()
    return [_row_to_profile(r, mask_key=mask_key) for r in rows]


def get_profile(
    profile_id: str,
    db_path: str = "config.db",
    *,
    mask_key: bool = False,
) -> Optional[Dict[str, Any]]:
    ensure_llm_schema(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM llm_provider_profile WHERE profile_id = ?", (profile_id,)
        ).fetchone()
    return _row_to_profile(row, mask_key=mask_key) if row else None


def get_active_profile(
    db_path: str = "config.db",
    *,
    mask_key: bool = False,
) -> Optional[Dict[str, Any]]:
    ensure_llm_schema(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM llm_provider_profile WHERE is_active = 1 LIMIT 1"
        ).fetchone()
    if row:
        return _row_to_profile(row, mask_key=mask_key)
    return _legacy_profile_from_sys_config(db_path)


def _legacy_profile_from_sys_config(db_path: str) -> Dict[str, Any]:
    store = ConfigStore(db_path)
    return {
        "profile_id": "_legacy_sys_config",
        "name": "Legacy Ollama (sys_config)",
        "provider": "ollama",
        "base_url": store.get("OLLAMA_BASE_URL", "http://localhost:11434") or "http://localhost:11434",
        "api_key": "",
        "api_key_set": False,
        "model_name": store.get("LLM_MODEL_NAME", "gemma4:e2b-it-qat") or "gemma4:e2b-it-qat",
        "temperature": float(store.get("LLM_TEMPERATURE", "0.1") or "0.1"),
        "max_tokens": store.get_int("LLM_MAX_TOKENS", 2048) or None,
        "extra_config": {"num_ctx": 8192, "num_predict": 8192},
        "is_enabled": True,
        "is_active": True,
        "notes": "从 sys_config LLM_* / OLLAMA_* 兼容读取",
    }


def _sync_sys_config(profile: Dict[str, Any], db_path: str) -> None:
    """激活时回写旧键，兼容未迁移脚本。"""
    store = ConfigStore(db_path)
    store.set("LLM_MODEL_NAME", str(profile.get("model_name") or ""), "model", "当前激活模型名")
    store.set(
        "LLM_TEMPERATURE",
        str(profile.get("temperature") if profile.get("temperature") is not None else 0.1),
        "model",
        "默认推理温度",
    )
    base = str(profile.get("base_url") or "")
    provider = profile.get("provider") or "ollama"
    if provider == "ollama":
        store.set("OLLAMA_BASE_URL", base or "http://localhost:11434", "model", "Ollama 服务地址")
    if profile.get("max_tokens"):
        store.set("LLM_MAX_TOKENS", str(profile["max_tokens"]), "model", "最大输出 Token 数")


def create_profile(data: Dict[str, Any], db_path: str = "config.db") -> Dict[str, Any]:
    ensure_llm_schema(db_path)
    provider = (data.get("provider") or "ollama").strip()
    if provider not in VALID_PROVIDERS:
        raise ValueError(f"invalid provider: {provider}")
    profile_id = data.get("profile_id") or uuid.uuid4().hex
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO llm_provider_profile
            (profile_id, name, provider, base_url, api_key, model_name,
             temperature, max_tokens, extra_config, is_enabled, is_active, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                data["name"],
                provider,
                str(data.get("base_url") or "").rstrip("/"),
                data.get("api_key") or "",
                data.get("model_name") or "",
                float(data.get("temperature") if data.get("temperature") is not None else 0.1),
                int(data["max_tokens"]) if data.get("max_tokens") not in (None, "") else None,
                json.dumps(data.get("extra_config") or {}, ensure_ascii=False),
                1 if data.get("is_enabled", True) else 0,
                1 if data.get("is_active") else 0,
                data.get("notes") or "",
            ),
        )
        if data.get("is_active"):
            conn.execute(
                "UPDATE llm_provider_profile SET is_active = 0 WHERE profile_id != ?",
                (profile_id,),
            )
        conn.commit()
    profile = get_profile(profile_id, db_path)
    if profile and profile.get("is_active"):
        _sync_sys_config(profile, db_path)
    return profile  # type: ignore


def update_profile(
    profile_id: str,
    data: Dict[str, Any],
    db_path: str = "config.db",
) -> Optional[Dict[str, Any]]:
    ensure_llm_schema(db_path)
    existing = get_profile(profile_id, db_path, mask_key=False)
    if not existing:
        return None
    if "provider" in data and data["provider"] and data["provider"] not in VALID_PROVIDERS:
        raise ValueError(f"invalid provider: {data['provider']}")

    # 掩码密钥：未改动则保留原值
    api_key = data.get("api_key")
    if api_key is None or "••••" in str(api_key):
        api_key = existing.get("api_key") or ""

    merged = {**existing, **data, "profile_id": profile_id, "api_key": api_key}
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE llm_provider_profile SET
                name = ?, provider = ?, base_url = ?, api_key = ?, model_name = ?,
                temperature = ?, max_tokens = ?, extra_config = ?,
                is_enabled = ?, notes = ?,
                updated_at = datetime('now','localtime')
            WHERE profile_id = ?
            """,
            (
                merged["name"],
                merged.get("provider") or "ollama",
                str(merged.get("base_url") or "").rstrip("/"),
                merged.get("api_key") or "",
                merged.get("model_name") or "",
                float(merged.get("temperature") if merged.get("temperature") is not None else 0.1),
                int(merged["max_tokens"]) if merged.get("max_tokens") not in (None, "") else None,
                json.dumps(merged.get("extra_config") or {}, ensure_ascii=False),
                1 if merged.get("is_enabled", True) else 0,
                merged.get("notes") or "",
                profile_id,
            ),
        )
        conn.commit()
    profile = get_profile(profile_id, db_path)
    if profile and profile.get("is_active"):
        _sync_sys_config(profile, db_path)
    return profile


def delete_profile(profile_id: str, db_path: str = "config.db") -> bool:
    ensure_llm_schema(db_path)
    with get_connection(db_path) as conn:
        cur = conn.execute(
            "DELETE FROM llm_provider_profile WHERE profile_id = ?", (profile_id,)
        )
        conn.commit()
        return cur.rowcount > 0


def activate_profile(profile_id: str, db_path: str = "config.db") -> Optional[Dict[str, Any]]:
    ensure_llm_schema(db_path)
    if not get_profile(profile_id, db_path):
        return None
    with get_connection(db_path) as conn:
        conn.execute("UPDATE llm_provider_profile SET is_active = 0")
        conn.execute(
            """
            UPDATE llm_provider_profile
            SET is_active = 1, is_enabled = 1, updated_at = datetime('now','localtime')
            WHERE profile_id = ?
            """,
            (profile_id,),
        )
        conn.commit()
    profile = get_profile(profile_id, db_path)
    if profile:
        _sync_sys_config(profile, db_path)
    return profile


def seed_default_llm_profiles(db_path: str = "config.db") -> Dict[str, Any]:
    """从现有 sys_config 迁移；若已有 Profile 则只补缺模板。"""
    ensure_llm_schema(db_path)
    existing = list_profiles(db_path, mask_key=False)
    by_id = {p["profile_id"]: p for p in existing}
    store = ConfigStore(db_path)
    model = store.get("LLM_MODEL_NAME", "gemma4:e2b-it-qat") or "gemma4:e2b-it-qat"
    base = store.get("OLLAMA_BASE_URL", "http://localhost:11434") or "http://localhost:11434"
    temp = float(store.get("LLM_TEMPERATURE", "0.1") or "0.1")
    max_tok = store.get_int("LLM_MAX_TOKENS", 2048)

    created: List[str] = []
    if "local_ollama" not in by_id:
        create_profile(
            {
                "profile_id": "local_ollama",
                "name": "本地 Ollama",
                "provider": "ollama",
                "base_url": base,
                "api_key": "",
                "model_name": model,
                "temperature": temp,
                "max_tokens": max_tok or None,
                "extra_config": {"num_ctx": 8192, "num_predict": 8192},
                "is_enabled": True,
                "is_active": True,
                "notes": "从 sys_config 迁移的默认本地模型",
            },
            db_path,
        )
        created.append("local_ollama")

    templates = [
        {
            "profile_id": "openai_official",
            "name": "OpenAI 官方",
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model_name": "gpt-4o-mini",
            "is_enabled": False,
            "is_active": False,
            "notes": "填写 API Key 后启用",
        },
        {
            "profile_id": "openai_compatible_relay",
            "name": "OpenAI 兼容中转",
            "provider": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model_name": "gpt-4o-mini",
            "is_enabled": False,
            "is_active": False,
            "notes": "第三方中转站：改 base_url / model / key",
        },
        {
            "profile_id": "gemini_native",
            "name": "Gemini 原生",
            "provider": "gemini_native",
            "base_url": "",
            "model_name": "gemini-2.0-flash",
            "is_enabled": False,
            "is_active": False,
            "notes": "Google Generative AI；填写 GOOGLE API Key 后启用",
        },
    ]
    for t in templates:
        if t["profile_id"] not in by_id:
            create_profile({**t, "api_key": "", "temperature": 0.1, "extra_config": {}}, db_path)
            created.append(t["profile_id"])

    # 确保至少一个 active
    active = get_active_profile(db_path)
    if not active or active.get("profile_id") == "_legacy_sys_config":
        if get_profile("local_ollama", db_path):
            activate_profile("local_ollama", db_path)

    return {"created": created, "active": get_active_profile(db_path, mask_key=True)}
