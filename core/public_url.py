"""Public base URL helpers for generated artifact links."""
from __future__ import annotations

import os


def get_public_base_url() -> str:
    """Return the externally reachable API origin (no trailing slash)."""
    raw = (
        os.environ.get("PUBLIC_BASE_URL")
        or os.environ.get("SIDEA_PUBLIC_BASE_URL")
        or "http://localhost:8000"
    ).strip()
    return raw.rstrip("/")


def public_url(path: str) -> str:
    """Join public origin with a relative path like 'sandbox_workspace/x.json'."""
    rel = (path or "").lstrip("/")
    return f"{get_public_base_url()}/{rel}"
