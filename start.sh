#!/bin/bash
echo "🚀 启动 SIDEA Agent 系统..."

# 确保端口不被占用
kill -9 $(lsof -t -i:8000) 2>/dev/null
kill -9 $(lsof -t -i:5173) 2>/dev/null

echo "📦 正在启动后端服务 (FastAPI / LangGraph)..."
# 启动后端
export SIDEA_RELOAD=0
python main.py > backend.log 2>&1 &
BACKEND_PID=$!

echo "🎨 正在启动前端服务 (Vite / React)..."
cd frontend
npm run dev &
FRONTEND_PID=$!

echo "✅ 系统启动完成！"
echo "- 前端界面: http://localhost:5173"
echo "- 后端 API: http://localhost:8000/docs"
echo "按 Ctrl+C 停止所有服务..."

wait $BACKEND_PID $FRONTEND_PID

