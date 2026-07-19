"""RCS 可配置适配层。"""
from .capabilities import CAPABILITIES, get_capability, capability_catalog, list_capability_ids
from .profile_store import (
    ensure_rcs_schema,
    list_profiles,
    get_profile,
    get_active_profile,
    create_profile,
    update_profile,
    delete_profile,
    activate_profile,
)
from .binding_store import (
    list_bindings,
    upsert_binding,
    replace_bindings,
    get_binding,
    export_profile_pack,
    import_profile_pack,
)
from .http_adapter import invoke_capability, invoke_capability_sync, AdapterError
from .semantic_tools import build_rcs_tools, get_rcs_tool_map
from .seed_nxp_erack import seed_nxp_erack_profile, nxp_default_bindings

__all__ = [
    "CAPABILITIES",
    "get_capability",
    "capability_catalog",
    "list_capability_ids",
    "ensure_rcs_schema",
    "list_profiles",
    "get_profile",
    "get_active_profile",
    "create_profile",
    "update_profile",
    "delete_profile",
    "activate_profile",
    "list_bindings",
    "upsert_binding",
    "replace_bindings",
    "get_binding",
    "export_profile_pack",
    "import_profile_pack",
    "invoke_capability",
    "invoke_capability_sync",
    "AdapterError",
    "build_rcs_tools",
    "get_rcs_tool_map",
    "seed_nxp_erack_profile",
    "nxp_default_bindings",
]
