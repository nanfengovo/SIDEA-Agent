from contextlib import contextmanager
import sqlite3
from pathlib import Path
from datetime import datetime

# 获取相对于当前文件的配置根目录
# 使用这个防止运行脚本路径不同导致找不到db文件
@contextmanager
def get_connection(db_path: str = "config.db") -> sqlite3.Connection:
    """
    获取数据库连接，设置 row_factory 以便按列名访问
    """
    # 解析 db_path 如果它是相对路径，基于项目的根目录（上两层）
    if not Path(db_path).is_absolute():
        actual_path = Path(__file__).parent.parent / db_path
    else:
        actual_path = Path(db_path)
        
    actual_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(actual_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db(db_path: str = "config.db"):
    """
    初始化数据库创建项目需要的表 (v3.0 架构)
    """
    with get_connection(db_path) as conn:
        cursor = conn.cursor()

        # 表 1: sys_config
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sys_config (
            config_key    TEXT PRIMARY KEY,
            config_value  TEXT NOT NULL,
            category      TEXT DEFAULT 'general',
            description   TEXT DEFAULT '',
            updated_at    TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        # 表 2: skills
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS skills (
            skill_id          TEXT PRIMARY KEY,
            skill_name        TEXT NOT NULL,
            description       TEXT DEFAULT '',
            template_path     TEXT NOT NULL,          -- .md 文件相对路径
            bound_tools       TEXT NOT NULL DEFAULT '[]',  -- JSON 数组
            temperature       REAL DEFAULT 0.1,
            is_enabled        INTEGER DEFAULT 1,
            sort_order        INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now','localtime')),
            updated_at        TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        # 表 3: analysis_cache
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_cache (
            data_hash     TEXT PRIMARY KEY,
            skill_id      TEXT,
            query_text    TEXT,
            result_text   TEXT NOT NULL,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            expires_at    TEXT
        );
        """)

        # 表 4: chat_sessions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_sessions (
            session_id    TEXT PRIMARY KEY,
            title         TEXT,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            updated_at    TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        # 表 5: chat_messages
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            message_id    TEXT PRIMARY KEY,
            session_id    TEXT NOT NULL,
            role          TEXT NOT NULL,
            content       TEXT NOT NULL,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
        );
        """)
        
        # 表 6: kb_documents
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS kb_documents (
            doc_id        TEXT PRIMARY KEY,
            filename      TEXT NOT NULL,
            file_type     TEXT NOT NULL,
            file_size     INTEGER DEFAULT 0,
            chunk_count   INTEGER DEFAULT 0,
            status        TEXT DEFAULT 'processing',
            created_at    TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        # 表 7: kb_experience_queue
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS kb_experience_queue (
            id            TEXT PRIMARY KEY,
            session_id    TEXT,
            content       TEXT NOT NULL,
            extracted_rule TEXT NOT NULL,
            status        TEXT DEFAULT 'pending', -- pending, approved, rejected
            created_at    TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        # RCS 可配置连接器（Profile + Binding）
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS rcs_connector_profile (
            profile_id     TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            base_url       TEXT NOT NULL,
            auth_type      TEXT NOT NULL DEFAULT 'bearer',
            auth_config    TEXT NOT NULL DEFAULT '{}',
            timeout_ms     INTEGER NOT NULL DEFAULT 15000,
            is_simulation  INTEGER NOT NULL DEFAULT 1,
            is_active      INTEGER NOT NULL DEFAULT 0,
            extra_headers  TEXT NOT NULL DEFAULT '{}',
            notes          TEXT DEFAULT '',
            created_at     TEXT DEFAULT (datetime('now','localtime')),
            updated_at     TEXT DEFAULT (datetime('now','localtime'))
        );
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS rcs_operation_binding (
            id              TEXT PRIMARY KEY,
            profile_id      TEXT NOT NULL,
            capability_id   TEXT NOT NULL,
            method          TEXT NOT NULL DEFAULT 'GET',
            path            TEXT NOT NULL,
            query_json      TEXT NOT NULL DEFAULT '{}',
            body_json       TEXT,
            headers_json    TEXT NOT NULL DEFAULT '{}',
            input_map_json  TEXT NOT NULL DEFAULT '{}',
            response_map_json TEXT NOT NULL DEFAULT '{}',
            success_when_json TEXT NOT NULL DEFAULT '{"http_status":[200]}',
            enabled         INTEGER NOT NULL DEFAULT 1,
            confirm_required INTEGER NOT NULL DEFAULT 0,
            risk_level_override TEXT,
            updated_at      TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(profile_id, capability_id)
        );
        """)

        # LLM Provider Profiles（多 Profile + 单 Active）
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_provider_profile (
            profile_id     TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            provider       TEXT NOT NULL,
            base_url       TEXT NOT NULL DEFAULT '',
            api_key        TEXT NOT NULL DEFAULT '',
            model_name     TEXT NOT NULL,
            temperature    REAL NOT NULL DEFAULT 0.1,
            max_tokens     INTEGER,
            extra_config   TEXT NOT NULL DEFAULT '{}',
            is_enabled     INTEGER NOT NULL DEFAULT 1,
            is_active      INTEGER NOT NULL DEFAULT 0,
            notes          TEXT DEFAULT '',
            created_at     TEXT DEFAULT (datetime('now','localtime')),
            updated_at     TEXT DEFAULT (datetime('now','localtime'))
        );
        """)

        conn.commit()
    print("SQLite database initialized successfully (v3.0)")

def seed_default_config(db_path: str = "config.db"):
    """
    插入系统默认配置
    """
    DEFAULT_CONFIGS = [
        ("PATH_LOG_PLC", "./logs/plc", "path", "PLC日志文件夹路径"),
        ("PATH_LOG_RCS", "./logs/rcs", "path", "RCS日志文件夹路径"),
        ("PATH_OUTPUT_REPORT", "./output/reports", "path", "报告输出路径"),
        
        ("LLM_MODEL_NAME", "gemma4:e2b-it-qat", "model", "Ollama 模型名称"),
        ("LLM_TEMPERATURE", "0.1", "model", "默认推理温度"),
        ("LLM_MAX_TOKENS", "2048", "model", "最大输出 Token 数"),
        ("OLLAMA_BASE_URL", "http://localhost:11434", "model", "Ollama 服务地址"),
        ("OLLAMA_KEEP_ALIVE", "30s", "model", "模型空闲卸载时间"),
        
        ("API_ABP_BASE_URL", "http://localhost:9000", "api", "C# ABP/RCS 系统基础地址（兼容旧配置；优先用 RCS 连接器 Profile）"),
        ("API_AUTH_TYPE", "bearer", "api", "认证方式"),
        ("API_ABP_TOKEN", "", "api", "ABP 接口访问 Token"),
        
        ("REGEX_PLC_ERROR", r"\[ERR\].*PLCManager|PlcConnection", "regex", "PLC错误日志匹配正则"),
        ("REGEX_RCS_REQUEST", r"RequestResponseLoggingMiddleware Request:", "regex", "RCS请求日志匹配正则"),
        
        ("AUTH_JWT_SECRET", "sidea-change-this-in-production", "system", "JWT 签名密钥"),
        ("LOG_PARSE_MODE", "passive", "system", "日志解析模式: passive/active/both"),
        ("CACHE_EXPIRE_HOURS", "24", "system", "分析缓存过期小时数"),

        # 文生图：默认关闭云端，无网工厂走离线矢量；可在管理后台开关
        ("IMAGE_CLOUD_ENABLED", "false", "image", "是否启用云端写实生图（AICodeWith/OpenAI Images 兼容）"),
        ("IMAGE_BACKUP_ENABLED", "false", "image", "是否启用 Pollinations 外网备用生图"),
        ("IMAGE_API_BASE_URL", "https://api.aicodewith.com", "image", "云端生图服务地址"),
        ("IMAGE_API_KEY", "", "image", "云端生图 API Key"),
        ("IMAGE_MODEL_NAME", "gpt-image-2", "image", "云端生图模型名"),
    ]
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.executemany(
            """
            INSERT OR IGNORE INTO sys_config (config_key, config_value, category, description)
            VALUES (?,?,?,?)
            """, DEFAULT_CONFIGS
        )
        conn.commit()
    print("Default configs seeded successfully")

def seed_default_skills(db_path: str = "config.db"):
    """
    插入默认 Skill 模板数据
    """
    DEFAULT_SKILLS = [
        {
            "skill_id": "general_assistant",
            "skill_name": "通用智能助手",
            "description": "全能型工业辅助智能体，可回答任意常规技术与业务问题",
            "template_path": "skills/templates/general_assistant.md",
            "bound_tools": '[]',
            "temperature": 0.4,
            "sort_order": 0,
        },
        {
            "skill_id": "plc_diagnostics",
            "skill_name": "PLC 故障诊断专家",
            "description": "分析 PLC 连接异常、通信故障、控制器报错",
            "template_path": "skills/templates/plc_diagnostics.md",
            "bound_tools": '["read_plc_log", "read_alarm_log", "plc_read", "plc_write", "read_document"]',
            "temperature": 0.1,
            "sort_order": 1,
        },
        {
            "skill_id": "rcs_api_analyst",
            "skill_name": "RCS 接口性能分析师",
            "description": "分析 RCS 系统 API 响应时间、错误率、流量趋势",
            "template_path": "skills/templates/rcs_api_analyst.md",
            "bound_tools": '["read_rcs_log", "generate_line_chart"]',
            "temperature": 0.1,
            "sort_order": 2,
        },
        {
            "skill_id": "efficiency_analyst",
            "skill_name": "自动化效率分析师",
            "description": "统计任务完成率、AGV 利用率、产线效率趋势",
            "template_path": "skills/templates/efficiency_analyst.md",
            "bound_tools": '["fetch_task_stats", "fetch_agv_status", "generate_line_chart", "generate_bar_chart"]',
            "temperature": 0.3,
            "sort_order": 3,
        },
        {
            "skill_id": "alarm_analyst",
            "skill_name": "报警记录分析师",
            "description": "统计报警频次、趋势、关联分析",
            "template_path": "skills/templates/alarm_analyst.md",
            "bound_tools": '["fetch_alarms", "generate_bar_chart"]',
            "temperature": 0.1,
            "sort_order": 4,
        },
        {
            "skill_id": "data_expert",
            "skill_name": "核心数据分析师",
            "description": "基于业务数据清洗与查询",
            "template_path": "skills/templates/data_expert.md",
            "bound_tools": '["text_to_sql", "export_excel", "generate_pdf", "generate_markdown", "abp_rest_api"]',
            "temperature": 0.1,
            "sort_order": 5,
        }
    ]
    
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        for skill in DEFAULT_SKILLS:
            cursor.execute(
                """
                INSERT OR IGNORE INTO skills 
                (skill_id, skill_name, description, template_path, bound_tools, temperature, sort_order)
                VALUES (?,?,?,?,?,?,?)
                """,
                (
                    skill["skill_id"], 
                    skill["skill_name"], 
                    skill["description"],
                    skill["template_path"], 
                    skill["bound_tools"], 
                    skill["temperature"], 
                    skill["sort_order"]
                )
            )
        conn.commit()
    print("Default skills seeded successfully")

if __name__ == "__main__":
    init_db("config.db")
    seed_default_config("config.db")
    seed_default_skills("config.db")
    
    # 打印测试
    with get_connection("config.db") as conn:
        rows = conn.execute("SELECT config_key, config_value FROM sys_config").fetchall()
        print("\n=== Configs ===")
        for r in rows:
            print(f"  {r['config_key']} = {r['config_value']}")
            
        rows = conn.execute("SELECT skill_id, skill_name, is_enabled FROM skills").fetchall()
        print("\n=== Skills ===")
        for r in rows:
            print(f"  {r['skill_id']}: {r['skill_name']} (enabled={r['is_enabled']})")