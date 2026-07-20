import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# 1. 把你刚才写的路由导入进来
from api.routes.chat import router as chat_router
from api.routes.dashboard import router as dashboard_router
import os

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"
# 2. 实例化一个 FastAPI 核心程序
app = FastAPI(title="SIDEA Agent API", version="1.1.0")

# 3. 挂载路由（所有的接口都会在前面自动加上 /api 前缀）
app.include_router(chat_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")

# 大屏渲染输出目录静态访问
_output_dir = Path(__file__).parent / "output" / "dashboards"
_output_dir.mkdir(parents=True, exist_ok=True)
app.mount("/output/dashboards", StaticFiles(directory=str(_output_dir)), name="dashboard_output")

# （可选）写一个简单的探针接口，用来测试服务是不是活的
@app.get("/")
def read_root():
    return {"message": "SIDEA Agent 核心服务已启动！"}

if __name__ == "__main__":
    # 4. 使用 uvicorn 启动 Web 服务器
    # 注意：这里的 host 必须是字符串，port 必须是整数
    print("🚀 准备启动 SIDEA Agent 后端服务...")
    uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)