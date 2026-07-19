import os
if "HTTP_PROXY" in os.environ: del os.environ["HTTP_PROXY"]
if "HTTPS_PROXY" in os.environ: del os.environ["HTTPS_PROXY"]
if "http_proxy" in os.environ: del os.environ["http_proxy"]
if "https_proxy" in os.environ: del os.environ["https_proxy"]

import urllib.request
urllib.request.getproxies = lambda: {}

import uvicorn
from api.app import create_app
from infra.database import init_db, seed_default_config, seed_default_skills

app = create_app()

if __name__ == "__main__":
    # 启动前确保数据库和种子数据就绪
    init_db("config.db")
    seed_default_config("config.db")
    seed_default_skills("config.db")
    try:
        from integrations.rcs import ensure_rcs_schema, seed_nxp_erack_profile
        ensure_rcs_schema("config.db")
        seed_nxp_erack_profile("config.db")
    except Exception as e:
        print(f"[main] RCS seed skipped: {e}")
    try:
        from integrations.llm import ensure_llm_schema, seed_default_llm_profiles
        ensure_llm_schema("config.db")
        seed_default_llm_profiles("config.db")
    except Exception as e:
        print(f"[main] LLM seed skipped: {e}")

    host = os.environ.get("SIDEA_HOST", "0.0.0.0")
    port = int(os.environ.get("SIDEA_PORT", "8000"))
    reload = (os.environ.get("SIDEA_RELOAD", "1") or "1").strip() not in ("0", "false", "False")

    if reload:
        uvicorn.run(
            "main:app",
            host=host,
            port=port,
            reload=True,
            reload_excludes=[
                "sandbox_workspace/*",
                "sandbox_workspace/**",
                "*.log",
                "**/__pycache__/**",
                "database/*",
                "frontend/**",
                "docs/**",
            ],
        )
    else:
        uvicorn.run(app, host=host, port=port, reload=False)
