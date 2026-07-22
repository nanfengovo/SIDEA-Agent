import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.routes import chat, config, skills, upload, admin_skills, admin_prompts, admin_tools, history, knowledge, admin_rcs, admin_llm, templates, models3d, admin_kb_rules, system_logs
from api.middlewares.audit import AuditLogMiddleware
import asyncio


def _cors_origins() -> list[str]:
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    # Local defaults for Vite + Docker web
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]


def create_app() -> FastAPI:
    app = FastAPI(title="SIDEA Agent API", version="0.1.0")

    origins = _cors_origins()
    allow_credentials = "*" not in origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if allow_credentials else ["*"],
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.add_middleware(AuditLogMiddleware)

    app.include_router(chat.router, prefix="/api", tags=["Chat"])
    app.include_router(config.router, prefix="/api", tags=["Config"])
    app.include_router(skills.router, prefix="/api", tags=["Skills"])
    app.include_router(upload.router, prefix="/api", tags=["Upload"])
    app.include_router(admin_skills.router, prefix="/api", tags=["Admin Skills"])
    app.include_router(admin_prompts.router, prefix="/api", tags=["Admin Prompts"])
    app.include_router(admin_tools.router, prefix="/api", tags=["Admin Tools"])
    app.include_router(admin_rcs.router, prefix="/api", tags=["Admin RCS"])
    app.include_router(admin_llm.router, prefix="/api", tags=["Admin LLM"])
    app.include_router(admin_kb_rules.router, prefix="/api", tags=["Admin KB Rules"])
    app.include_router(system_logs.router, prefix="/api", tags=["System Logs"])
    app.include_router(history.router, prefix="/api", tags=["History"])
    app.include_router(knowledge.router, prefix="/api", tags=["Knowledge"])
    app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
    app.include_router(models3d.router, prefix="/api", tags=["3D Models"])

    os.makedirs("uploads", exist_ok=True)
    os.makedirs("sandbox_workspace", exist_ok=True)
    os.makedirs("database", exist_ok=True)
    os.makedirs("output", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
    app.mount("/sandbox_workspace", StaticFiles(directory="sandbox_workspace"), name="sandbox_workspace")

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "sidea-agent",
            "version": "0.1.0",
        }

    @app.on_event("startup")
    def _seed_integrations():
        try:
            from infra.database import init_db, seed_default_config, seed_default_skills
            from integrations.rcs import ensure_rcs_schema, seed_nxp_erack_profile
            from integrations.llm import ensure_llm_schema, seed_default_llm_profiles
            init_db("config.db")
            seed_default_config("config.db")
            seed_default_skills("config.db")
            ensure_rcs_schema("config.db")
            seed_nxp_erack_profile("config.db")
            ensure_llm_schema("config.db")
            seed_default_llm_profiles("config.db")
            
            # Start KB Auto-Review Loop in background
            from core.kb_auto_review import auto_review_loop
            asyncio.create_task(auto_review_loop(interval_seconds=300))
        except Exception as e:
            print(f"[startup] seed skipped: {e}")

    return app
