# SIDEA Agent (工控智能诊断与效率分析系统)

**SIDEA** (System for Industrial Diagnostics & Efficiency Analysis) 是一个高度智能化、可定制化的人工智能系统，专为工业控制（如 PLC 诊断、报警日志分析）及各类专业领域的专家辅助支持而设计。该系统拥有极简而极客的前端界面、稳健的 Python 异步后端以及支持原生跨平台运行的 C# 客户端。

## 🎯 核心功能与作用 (Features)

1. **智能会话驱动引擎**: 基于 LangGraph 与 LangChain 打造，具备深度推理、流式响应（Streaming）、函数调用（Tool Calling）能力。
2. **多端同步与原生体验**:
   - **Web 前端**: 基于 React + Framer Motion 构建的沉浸式暗黑/亮色主题界面，支持富文本Markdown渲染与流畅动画。
   - **C# 桌面端**: 基于 Avalonia UI 与 MVVM 架构 1:1 复刻 Web 端的聊天与管理体验，带来极致的系统原生运行效率。
3. **强大的后台管理 (Admin Console)**: 完全开放的数据面板！无论是系统全局配置、Agent 提示词模板、可用的 Tool 插件，统统支持在线增删改查 (CRUD)。
4. **历史对话流转与沉淀**: 独立设计的 SQLite 会话持久化机制。通过左侧边栏（Web 端）即可快速呼出历史长河，自由穿梭于过去的问题上下文中。
5. **高度自定义对话配置**: 会话时支持实时下发 `思考深度`、`上下文窗口长度`，乃至模型目标语言进行极速机翻，彻底释放大模型的高阶掌控力。

## 🛠️ 技术栈 (Tech Stack)

### Backend (后端逻辑与 AI 调度)
- **FastAPI**: 提供高性能的异步 RESTful 接口与 Server-Sent Events (SSE) 推送流。
- **LangChain & LangGraph**: Agent 大脑，通过图状态机管理多轮对话与工具调用。
- **SQLite**: 负责存储配置 (configs)、技能 (skills)、历史会话 (history)。

### Web Frontend (网页端)
- **React 18 + Vite**: 高效渲染与闪电级热更新。
- **Tailwind CSS & Framer Motion**: 负责全站精美的微交互、毛玻璃组件（Glassmorphism）与动画过渡。
- **Ant Design (Antd)**: 提供可靠的后台表格数据与弹窗组件支持。

### Desktop Client (C# 桌面端)
- **Avalonia UI**: 现代跨平台原生 UI 框架，复刻工业级暗黑风设计。
- **CommunityToolkit.Mvvm**: 高效的 MVVM 架构模式驱动数据双向绑定。
- **HttpClient**: 异步桥接所有后台 RESTful 端点。

## 🚀 快速上手 (Quick Start)

### 1. 启动后端 (Python FastAPI)

```bash
# 1. 推荐使用虚拟环境
python3 -m venv venv
source venv/bin/activate  # Mac/Linux
# .\venv\Scripts\activate # Windows

# 2. 安装依赖 (示例，请根据实际 requirements 安装)
pip install fastapi uvicorn langchain langgraph sqlite3 pydantic aiosqlite

# 3. 运行服务 (默认 8000 端口)
python main.py
```

### 2. 启动网页端 (React + Vite)

```bash
# 进入 frontend 目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器 (默认 5173 端口)
npm run dev
```
打开浏览器访问：[http://localhost:5173](http://localhost:5173)

### 3. 启动桌面端 (C# Avalonia)

确保你已经安装了 [.NET SDK (>= 8.0)](https://dotnet.microsoft.com/download)。

```bash
# 进入 C# 客户端目录
cd SIDEA.Client

# 编译并运行
dotnet run
```

## ⚙️ 系统配置指南 (Configuration)

你可以通过任何一端的 **Admin Console (管理台)** 来接管你的 Agent 行为：

1. **技能 & 提示词 (Skills)**: 定义智能体的角色。例如新增一个 `SkillId: sql_expert`，并为其编写对应的 `System Prompt` 模板。
2. **全局设置 (Config)**: 配置如大模型接口基地址 (BaseURL)、默认调用的底层大模型(ModelName) 等系统常量。
3. **工具总览 (Tools Hub)**: 查阅所有通过 Python 后端 `@tool` 注册好的本地系统操作接口。

Enjoy your intelligent assistant! 💡
