import sqlite3
from pathlib import Path
from datetime import datetime
import json

# 使用相对于当前文件位置的绝对路径，避免由于执行命令的目录不同导致数据库被建在错误的位置
DB_PATH = Path(__file__).parent.parent / 'database' / 'SIDEA.db'

def get_connection() -> sqlite3.Connection:
    """
    获取数据库连接，已经存在也不报错，父目录不存在也一起创建
    """
    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    conn = sqlite3.connect(
        DB_PATH
    )

    # 增强可读性，返回结果支持通过列名访问
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    初始化数据库创建项目需要的表 (v2.1 架构)
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        #=====================
        # 1. 系统全局配置表
        #=====================
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sys_config
        (
            config_key TEXT PRIMARY KEY,
            config_value TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            description TEXT,
            updated_at TEXT
        )
        """)

        #=====================
        # 2. LLM 模型池 (支持多模型配置)
        #=====================
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_models
        (
            model_id TEXT PRIMARY KEY,           -- 例如: 'ollama_gemma4', 'openai_gpt4o'
            provider TEXT NOT NULL,              -- 提供商: 'ollama', 'openai', 'azure'
            model_name TEXT NOT NULL,            -- 实际调用的模型名: 'gemma4:e2b-it-qat', 'gpt-4o'
            base_url TEXT,                       -- API 地址
            api_key TEXT,                        -- 密钥（如果是本地Ollama则留空）
            is_active INTEGER DEFAULT 1,         -- 是否启用
            created_at TEXT
        )
        """)

        #=====================
        # 3. Agent 角色表 (高度配置化的核心)
        #=====================
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agent_roles
        (
            role_id TEXT PRIMARY KEY,            -- 唯一标识, 如 'plc_expert'
            role_name TEXT NOT NULL,             -- 展示名称, 如 'PLC 故障诊断专家'
            description TEXT,                    -- 角色描述
            system_prompt TEXT NOT NULL,         -- 角色的专属 System Prompt
            bound_tools TEXT NOT NULL DEFAULT '[]', -- JSON 数组：绑定的 tool 名称列表
            default_model_id TEXT,               -- 该角色专属绑定的模型 ID (可为空)
            temperature REAL DEFAULT 0.1,        -- 角色生成温度
            is_enabled INTEGER DEFAULT 1,        -- 前端是否可选用该角色：1=启用 0=禁用
            created_at TEXT,
            updated_at TEXT
        )
        """)

        #=====================
        # 4. 分析历史缓存表
        #=====================
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_cache
        (
            data_hash TEXT PRIMARY KEY,
            role_id TEXT,
            user_question TEXT,
            result_text TEXT NOT NULL,
            created_at TEXT,
            expires_at TEXT
        )
        """)

        conn.commit()
    print("SQLite database initialized successfully (v2.1)")

def seed_default_data():
    """
    初始化默认配置、默认模型和默认角色
    """
    now = datetime.now().isoformat()
    
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. 初始化系统配置
        configs = [
            ("PATH_LOG_PLC", "./logs/plc", "path", "PLC日志目录", now),
            ("PATH_LOG_RCS", "./logs/rcs", "path", "RCS日志目录", now),
            ("DEFAULT_MODEL_ID", "ollama_gemma", "llm", "系统默认采用的AI模型", now)
        ]
        cursor.executemany(
            """
            INSERT OR IGNORE INTO sys_config (config_key, config_value, category, description, updated_at)
            VALUES (?,?,?,?,?)
            """, configs
        )

        # 2. 初始化模型池
        models = [
            (
                "ollama_gemma", 
                "ollama", 
                "gemma4:e2b-it-qat", 
                "http://localhost:11434", 
                "", 
                1, 
                now
            ),
            (
                "openai_gpt4o", 
                "openai", 
                "gpt-4o", 
                "https://api.openai.com/v1", 
                "sk-xxxxxx", 
                0, 
                now
            )
        ]
        cursor.executemany(
            """
            INSERT OR IGNORE INTO llm_models (model_id, provider, model_name, base_url, api_key, is_active, created_at)
            VALUES (?,?,?,?,?,?,?)
            """, models
        )

        # 3. 初始化默认 Agent 角色
        roles = [
            (
                "plc_expert",
                "PLC 故障诊断专家",
                "专注解析工业流水线PLC底层报警和过载停机问题。",
                "你是一位拥有20年经验的工业自动化PLC专家。在回复时请务必关注报警代码、发生的时间顺序和电机过载情况。严禁胡编乱造。",
                json.dumps(["read_plc_log", "read_alarm_log"]),  # 动态绑定的原子工具
                "ollama_gemma",  # 绑定本地模型
                0.1,
                1,
                now,
                now
            ),
            (
                "efficiency_analyst",
                "效率趋势分析师",
                "根据订单和AGV稼动率生成效率图表。",
                "你是数据分析师。你的主要任务是根据给定的多维度数据，生成能直观反映系统瓶颈的趋势图。",
                json.dumps(["fetch_order_data", "fetch_agv_utilization", "generate_line_chart"]),
                None,            # 不绑定，默认使用系统配置的 LLM
                0.3,             # 图表分析可以适当增加一点温度
                1,
                now,
                now
            )
        ]
        cursor.executemany(
            """
            INSERT OR IGNORE INTO agent_roles 
            (role_id, role_name, description, system_prompt, bound_tools, default_model_id, temperature, is_enabled, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """, roles
        )

        conn.commit()
    print("Default Configs, Models, and Roles inserted successfully")

if __name__ == "__main__":
    init_db()
    seed_default_data()
    print("SIDEA database setup complete")