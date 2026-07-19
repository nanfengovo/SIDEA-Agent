import os
import re
import json
from typing import Dict, List, Any
from pathlib import Path
from infra.database import get_connection
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("skills.registry")

# 预先导入所有工具，以便通过字符串名动态挂载
from tools.log_tools import read_plc_log, read_rcs_log
from tools.chart_tools import generate_line_chart, generate_bar_chart
from tools.io_tools import export_excel, write_file, read_file, generate_markdown, read_document
from tools.plc_tools import plc_read, plc_write
from tools.api_tools import abp_rest_api
from tools.data_tools import clean_data, split_log, text_to_sql
from tools.time_tools import get_current_time
from tools.sandbox_tools import run_python_in_sandbox
from tools.image_tools import generate_image
from integrations.rcs.semantic_tools import get_rcs_tool_map

# 所有 skill 都默认挂载的基础工具（不需要在 DB 中逐一声明）
BASE_TOOLS = [get_current_time, read_document, run_python_in_sandbox, generate_image]

TOOL_MAP = {
    "get_current_time": get_current_time,
    "read_plc_log": read_plc_log,
    "read_rcs_log": read_rcs_log,
    "generate_line_chart": generate_line_chart,
    "generate_bar_chart": generate_bar_chart,
    "export_excel": export_excel,
    "write_file": write_file,
    "read_file": read_file,
    "read_document": read_document,
    "generate_markdown": generate_markdown,
    "plc_read": plc_read,
    "plc_write": plc_write,
    "abp_rest_api": abp_rest_api,
    "clean_data": clean_data,
    "split_log": split_log,
    "text_to_sql": text_to_sql,
    "run_python_in_sandbox": run_python_in_sandbox,
    "generate_image": generate_image,
}

# 合并 RCS 语义工具（fetch_task_stats / fetch_agv_status / fetch_alarms / rcs_*）
TOOL_MAP.update(get_rcs_tool_map())

class SkillRegistry:
    def __init__(self, db_path: str = "config.db"):
        self.db_path = db_path
        
    def load_skill(self, skill_id: str) -> Dict[str, Any]:
        """从数据库与本地文件系统组装出一个完整的 Skill 配置"""
        with get_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM skills WHERE skill_id = ?", (skill_id,)).fetchone()
            if not row:
                raise ValueError(f"Skill '{skill_id}' 未找到。")
            if not row["is_enabled"]:
                raise ValueError(f"Skill '{skill_id}' 已被禁用。")
                
            skill_data = dict(row)
            
        template_path = Path(__file__).parent.parent / skill_data["template_path"]
        
        system_prompt = ""
        if template_path.exists():
            with open(template_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # 简单分离 YAML frontmatter 和 Markdown 正文
                if content.startswith("---"):
                    parts = content.split("---", 2)
                    if len(parts) == 3:
                        system_prompt = parts[2].strip()
                    else:
                        system_prompt = content
                else:
                    system_prompt = content
        else:
            logger.warning(f"Template path {template_path} not found for skill {skill_id}.")
            
        # 注入当前日期时间，让模型知道"今天"是哪天
        from datetime import datetime
        today_str = datetime.now().strftime("%Y-%m-%d")
        weekday_map = ["周一","周二","周三","周四","周五","周六","周日"]
        weekday = weekday_map[datetime.now().weekday()]
        system_prompt = f"当前日期: {today_str}（{weekday}）\n\n" + system_prompt
            
        bound_tools_str = skill_data["bound_tools"]
        try:
            tool_names = json.loads(bound_tools_str)
        except json.JSONDecodeError:
            tool_names = []
            
        actual_tools = []
        for tname in tool_names:
            if tname in TOOL_MAP:
                actual_tools.append(TOOL_MAP[tname])
            else:
                logger.warning(f"Tool {tname} is mapped in DB but not found in codebase.")
                
        # 合并 BASE_TOOLS（去重），确保 get_current_time 始终可用
        base_tool_names = {t.name for t in BASE_TOOLS}
        merged_tools = list(BASE_TOOLS) + [t for t in actual_tools if t.name not in base_tool_names]

        return {
            "skill_id": skill_data["skill_id"],
            "skill_name": skill_data["skill_name"],
            "temperature": skill_data["temperature"],
            "system_prompt": system_prompt,
            "tools": merged_tools
        }