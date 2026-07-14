import sqlite3
from pathlib import Path
from datetime import datetime
# 使用相对于当前文件位置的绝对路径，避免由于执行命令的目录不同导致数据库被建在错误的位置
DB_PATH = Path(__file__).parent.parent / 'database' / 'SIDEA.db'
def get_connection():
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

    # 增强可读性
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    初始化数据库创建项目需要的表
    """

    conn = get_connection()
    cursor = conn.cursor()

    #=====================
    # 1、系统配置表
    #=====================

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sys_config
    (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        config_key TEXT NOT NULL UNIQUE,
        
        config_value TEXT ,
        
        description TEXT,
        
        created_time TEXT,
        
        updated_time TEXT
    )
    """)

    #=====================
    # 2、 Agent Skill 技能表
    #=====================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_skill
    (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        skill_name TEXT NOT NULL UNIQUE,

        description TEXT,

        tool_name TEXT,

        enabled INTEGER DEFAULT 1,

        created_time TEXT
    )
    """)

    # ===============================
    # 3. AI分析历史缓存表
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS analysis_history
    (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        request_hash TEXT UNIQUE,

        user_question TEXT,

        analysis_result TEXT,

        created_time TEXT
    )
    """)

    conn.commit()

    conn.close()

    print("SQLite database initialized successfully")


def seed_default_config():
    """
    初始化默认配置
    """
    configs = [
        (
            "PATH_LOG_PLC",
            "./logs/plc",
            "PLC日志目录"
        ),
        (
            "PATH_LOG_RCS",
            "./logs/rcs",
            "RCS日志目录"
        ),
        (
            "PATH_LOG_TM",
            "./logs/tm",
            "TM接口日志目录"
        ),
        (
            "LLM_MODEL_NAME",
            "gemma4:e2b-it-qat",
            "本地大模型名称"
        ),
        (
            "LLM_MAX_TOKENS",
            "2048",
            "最大输出Token"
        ),
        (
            "LLM_TEMPERATURE",
            "0.1",
            "模型随机性参数"
        ),
        (
            "OLLAMA_BASE_URL",
            "http://localhost:11434",
            "Ollama服务地址"
        ),
        (
            "API_ABP_BASE_URL",
            "http://localhost:5000",
            "C# ABP接口地址"
        ),
        (
            "PATH_OUTPUT_REPORT",
            "./output",
            "分析报告输出目录"
        )
    ]
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    # 构造批量插入的数据列表
    records = [(key, value, desc, now, now) for key, value, desc in configs]
    
    # 使用 executemany 批量执行插入，提高性能和代码简洁度
    cursor.executemany(
        """
        INSERT OR IGNORE INTO sys_config
        (config_key, config_value, description, created_time, updated_time)
        VALUES (?,?,?,?,?)
        """,
        records
    )

    conn.commit()
    conn.close()

    print("Default configs inserted")

def seed_default_skills():
    """
    初始化Agent Skills
    """

    skills = [

        (
            "log_analyzer",

            "分析PLC/RCS/TM日志",

            "analyze_log_by_type"
        ),
        (
            "abp_data_fetcher",

            "调用C# ABP接口获取业务数据",

            "fetch_business_data_from_abp"
        ),
        (
            "chart_generator",

            "根据数据生成效率分析图表",

            "generate_efficiency_chart"
        ),
        (
            "report_generator",

            "生成Word/PDF诊断报告",

            "generate_report"
        )
    ]


    conn = get_connection()

    cursor = conn.cursor()


    now=datetime.now().isoformat()


    records = [(name, desc, tool, 1, now) for name, desc, tool in skills]

    cursor.executemany(
        """
        INSERT OR IGNORE INTO agent_skill
        (skill_name, description, tool_name, enabled, created_time)
        VALUES (?,?,?,?,?)
        """,
        records
    )

    conn.commit()

    conn.close()


    print("Default skills inserted")
if __name__ == "__main__":

    init_db()

    seed_default_config()

    seed_default_skills()

    print("SIDEA database setup complete")