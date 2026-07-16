from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.routes import chat, config, skills, upload, admin_skills, admin_prompts, admin_tools, history

def create_app() -> FastAPI:
    app = FastAPI(title="SIDEA Agent API", version="3.0")
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(chat.router, prefix="/api", tags=["Chat"])
    app.include_router(config.router, prefix="/api", tags=["Config"])
    app.include_router(skills.router, prefix="/api", tags=["Skills"])
    app.include_router(upload.router, prefix="/api", tags=["Upload"])
    app.include_router(admin_skills.router, prefix="/api", tags=["Admin Skills"])
    app.include_router(admin_prompts.router, prefix="/api", tags=["Admin Prompts"])
    app.include_router(admin_tools.router, prefix="/api", tags=["Admin Tools"])
    app.include_router(history.router, prefix="/api", tags=["History"])
    
    # Mount static uploads directory for frontend to access images
    import os
    os.makedirs("uploads", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
    
    return app
