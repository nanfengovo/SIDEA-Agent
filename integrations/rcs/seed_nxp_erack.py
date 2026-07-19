"""NXP TW eRack RCS 默认 Profile + 操作绑定种子。"""
from __future__ import annotations

from typing import Any, Dict, List

from .profile_store import (
    ensure_rcs_schema,
    list_profiles,
    create_profile,
    activate_profile,
    get_active_profile,
)
from .binding_store import replace_bindings, list_bindings
from infra.config_store import ConfigStore

NXP_PROFILE_ID = "nxp_tw_erack"
NXP_PROFILE_NAME = "NXP TW eRack RCS"


def nxp_default_bindings() -> List[Dict[str, Any]]:
    return [
        {
            "capability_id": "plc.read",
            "method": "POST",
            "path": "/api/app/p-lCRead-and-write/read",
            "query": {"name": "{{tag_name}}"},
            "body": None,
            "response_map": {"value": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "plc.write",
            "method": "POST",
            "path": "/api/app/p-lCRead-and-write/write",
            "query": {"name": "{{tag_name}}", "value": "{{value}}"},
            "body": None,
            "response_map": {"raw": "$"},
            "confirm_required": True,
            "risk_level_override": "write",
            "enabled": True,
        },
        {
            "capability_id": "task.list",
            "method": "GET",
            "path": "/api/app/auto-task/auto-task-list",
            "query": {},
            "body": None,
            "response_map": {"items": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "task.detail",
            "method": "GET",
            "path": "/api/app/auto-task/{{task_id}}/monitor-detail",
            "query": {},
            "body": None,
            "response_map": {"detail": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "task.cancel",
            "method": "POST",
            "path": "/api/app/auto-task/{{task_id}}/cancel",
            "query": {},
            "body": {},
            "response_map": {"raw": "$"},
            "confirm_required": True,
            "risk_level_override": "dangerous",
            "enabled": True,
        },
        {
            "capability_id": "agv.status",
            "method": "GET",
            "path": "/api/app/t-m/task-list",
            "query": {},
            "body": None,
            "response_map": {"items": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "alarm.list",
            "method": "GET",
            "path": "/api/app/location-config/erack-list",
            "query": {},
            "body": None,
            "response_map": {"items": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "log.plc",
            "method": "GET",
            "path": "/api/app/plc-interaction-log",
            "query": {},
            "body": None,
            "response_map": {"items": "$", "raw": "$"},
            "enabled": True,
        },
        {
            "capability_id": "log.third_party",
            "method": "GET",
            "path": "/api/app/a-piLog",
            "query": {},
            "body": None,
            "response_map": {"items": "$", "raw": "$"},
            "enabled": True,
        },
        # map.snapshot 多数项目暂无 REST，默认禁用；有接口后再启用
        {
            "capability_id": "map.snapshot",
            "method": "GET",
            "path": "/api/app/agv-map/snapshot",
            "query": {},
            "body": None,
            "response_map": {"robots": "$.robots", "zones": "$.zones", "raw": "$"},
            "enabled": False,
        },
    ]


def seed_nxp_erack_profile(db_path: str = "config.db") -> Dict[str, Any]:
    """幂等种子：若尚无任何 Profile，则创建并激活 NXP 默认包。"""
    ensure_rcs_schema(db_path)
    existing = list_profiles(db_path)
    if existing:
        active = get_active_profile(db_path)
        return {"seeded": False, "reason": "profiles_exist", "active": active}

    store = ConfigStore(db_path)
    base_url = store.get("API_ABP_BASE_URL", "http://localhost:9000") or "http://localhost:9000"
    # 历史默认 5000 时改为 eRack 常见 9000
    if "localhost:5000" in base_url:
        base_url = "http://localhost:9000"
    token = store.get("API_ABP_TOKEN", "") or ""
    auth_type = store.get("API_AUTH_TYPE", "bearer") or "bearer"

    profile = create_profile(
        {
            "profile_id": NXP_PROFILE_ID,
            "name": NXP_PROFILE_NAME,
            "base_url": base_url,
            "auth_type": auth_type,
            "auth_config": {"token": token},
            "timeout_ms": 15000,
            "is_simulation": True,
            "is_active": True,
            "notes": "NXP 台湾封测 eRack RCS 默认绑定包（仿真可改 base_url/鉴权）",
        },
        db_path=db_path,
    )
    activate_profile(NXP_PROFILE_ID, db_path)
    bindings = replace_bindings(NXP_PROFILE_ID, nxp_default_bindings(), db_path)
    return {
        "seeded": True,
        "profile": profile,
        "bindings_count": len(bindings),
        "bindings": list_bindings(NXP_PROFILE_ID, db_path),
    }
