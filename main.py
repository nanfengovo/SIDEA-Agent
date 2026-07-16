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
    
    # 启动 Uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)