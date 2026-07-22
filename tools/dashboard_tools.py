"""
Dashboard Tools — Agent 大屏工具集 v2
提供模板检索、推荐、渲染三大工具供 LangGraph Agent 调用。

主要升级：
- recommend_dashboard_template 增加 intent 参数，基于分类体系精确匹配
- 支持按 category / subcategory / tags 多维度检索
- get_dashboard_stats 返回分类统计摘要，辅助 Agent 选择
"""
import json
import sqlite3
import urllib.parse
from infra.database import get_connection

DB_PATH = "config.db"

# 意图 → 分类 + 关键字映射
INTENT_MAP = {
    "cockpit":      {"category": "cockpit",      "style_hint": "暗金",    "keywords": ["驾驶舱", "CEO", "CXO", "战略", "决策", "高管", "汇报"]},
    "monitoring":   {"category": "operations",   "style_hint": "科技蓝",  "keywords": ["监控", "告警", "实时", "状态", "RCS", "AMR", "设备", "运营"]},
    "twin":         {"category": "digital_twin", "style_hint": "全息投影","keywords": ["数字孪生", "3D", "三维", "仿真", "工厂", "园区", "车间"]},
    "showcase":     {"category": "visualization","style_hint": "赛博朋克", "keywords": ["展示", "发布", "汇报", "大屏", "酷炫", "炫酷"]},
    "kpi":          {"category": "kpi_board",    "style_hint": "极简白",  "keywords": ["看板", "KPI", "日报", "月报", "指标", "BI", "分析"]},
    "industry":     {"category": "industry",     "style_hint": "工业橙",  "keywords": ["工厂", "产线", "能源", "电力", "医疗", "物流", "供应链", "金融"]},
    "smart_scene":  {"category": "smart_scene",  "style_hint": "全息投影","keywords": ["智慧城市", "智慧园区", "楼宇", "交通", "社区"]},
}

STYLE_KEYWORDS = {
    "科技蓝": ["科技", "工业", "自动化", "RCS", "AMR", "机器人"],
    "赛博朋克": ["酷炫", "炫酷", "赛博", "未来", "展示"],
    "暗金": ["高端", "商务", "汇报", "CEO", "CXO", "驾驶舱", "管理层"],
    "工业橙": ["工厂", "生产", "设备", "机械", "制造"],
    "全息投影": ["数字孪生", "3D", "三维", "全息", "仿真"],
    "矩阵绿": ["安全", "监控", "命令中心", "网络", "运维"],
    "告警红": ["告警", "应急", "预警", "报警", "紧急", "红色"],
    "极简白": ["简洁", "清晰", "BI", "报告", "日报", "分析"],
}


from langchain_core.tools import tool

@tool("list_dashboard_templates")
def list_dashboard_templates(
    style: str = None,
    scenario: str = None,
    category: str = None,
    has_3d: bool = None,
    limit: int = 20
) -> str:
    """
    列出可用的大屏模板。

    Args:
        style: 视觉风格过滤 (科技蓝/暗金/赛博朋克/工业橙/全息投影/矩阵绿/告警红/极简白)
        scenario: 业务场景过滤 (如 RCS监控/智慧工厂/CEO驾驶舱/物流运营)
        category: 模板类别过滤 (digital_twin/cockpit/operations/industry/smart_scene/visualization/kpi_board)
        has_3d: 是否需要3D数字孪生效果
        limit: 返回最大数量

    Returns:
        JSON 字符串，包含匹配的模板列表和统计
    """
    with get_connection(DB_PATH) as conn:
        cursor = conn.cursor()
        query = "SELECT template_id, name, category, style, scenario, has_3d, source, description, layout_config FROM dashboard_templates WHERE is_enabled = 1"
        params = []

        if style:
            query += " AND style = ?"
            params.append(style)
        if scenario:
            query += " AND (scenario = ? OR scenario LIKE ?)"
            params.extend([scenario, f"%{scenario}%"])
        if category:
            query += " AND category = ?"
            params.append(category)
        if has_3d is not None:
            query += " AND has_3d = ?"
            params.append(1 if has_3d else 0)

        query += f" ORDER BY category, style LIMIT {int(limit)}"
        cursor.execute(query, params)
        rows = cursor.fetchall()

    templates = []
    for r in rows:
        t = dict(r)
        try:
            cfg = json.loads(t.get("layout_config") or "{}")
            t["tags"] = cfg.get("tags", [])
            t["complexity"] = cfg.get("complexity", "medium")
            t["subcategory"] = cfg.get("subcategory", "")
        except Exception:
            t["tags"] = []
        del t["layout_config"]
        templates.append(t)

    return json.dumps({
        "count": len(templates),
        "templates": templates,
        "tip": "使用 recommend_dashboard_template 根据需求自动推荐最佳模板"
    }, ensure_ascii=False)


@tool("recommend_dashboard_template")
def recommend_dashboard_template(
    query: str,
    intent: str = None,
    top_k: int = 3
) -> str:
    """
    根据用户描述智能推荐最合适的大屏模板。调用此工具时请描述用户的大屏需求。

    Args:
        query: 用户的自然语言需求描述 (如 "帮我做一个RCS仓储运营监控大屏，科技蓝风格")
        intent: 需求意图 (可选: cockpit/monitoring/twin/showcase/kpi/industry/smart_scene)
               - cockpit: 管理层决策驾驶舱 (CEO/CXO大屏)
               - monitoring: 实时运营监控 (RCS/设备/告警)
               - twin: 数字孪生3D场景
               - showcase: 展示汇报类大屏
               - kpi: 日常KPI看板/BI分析
               - industry: 垂直行业大屏 (工厂/物流/能源)
               - smart_scene: 智慧城市/园区场景
        top_k: 返回推荐数量 (默认3个)

    Returns:
        JSON 字符串，包含推荐模板列表和推荐理由
    """
    # ── Step 1: 推断 intent ──
    if not intent:
        for key, cfg in INTENT_MAP.items():
            if any(kw in query for kw in cfg["keywords"]):
                intent = key
                break
        if not intent:
            intent = "monitoring"  # 默认运营监控

    intent_cfg = INTENT_MAP.get(intent, INTENT_MAP["monitoring"])
    preferred_category = intent_cfg["category"]
    style_hint = intent_cfg["style_hint"]

    # ── Step 2: 推断风格 ──
    selected_style = None
    for style, kws in STYLE_KEYWORDS.items():
        if any(kw in query for kw in kws) or style in query:
            selected_style = style
            break
    if not selected_style:
        selected_style = style_hint  # 使用 intent 默认风格

    # ── Step 3: 推断场景关键字 ──
    scenario_patterns = [
        "RCS", "AMR", "AGV", "仓储", "工厂", "物流", "能源", "医疗", "金融",
        "驾驶舱", "园区", "城市", "交通", "楼宇", "安防", "销售", "财务", "生产"
    ]
    selected_scenario = next((p for p in scenario_patterns if p in query), None)
    needs_3d = any(kw in query.lower() for kw in ["3d", "数字孪生", "三维", "孪生", "twin"])

    # ── Step 4: 查询并评分 ──
    with get_connection(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM dashboard_templates WHERE is_enabled = 1",
        )
        all_templates = [dict(r) for r in cursor.fetchall()]

    scored = []
    for t in all_templates:
        score = 0

        # Category match (highest weight)
        if t["category"] == preferred_category:
            score += 20
        
        # Style match
        if t["style"] == selected_style:
            score += 15
        elif t["style"] == style_hint:
            score += 8

        # Scenario match
        if selected_scenario and selected_scenario in (t["scenario"] or ""):
            score += 12

        # 3D match
        if needs_3d and t["has_3d"] == 1:
            score += 15
        elif not needs_3d and t["has_3d"] == 0:
            score += 2

        # Tags and description keyword match
        try:
            cfg = json.loads(t.get("layout_config") or "{}")
            tags = cfg.get("tags", [])
            for tag in tags:
                if tag in query:
                    score += 5
        except Exception:
            pass

        desc = (t.get("description") or "").lower()
        name = (t.get("name") or "").lower()
        for word in query.replace("，", " ").replace("。", " ").split():
            if len(word) >= 2 and (word in desc or word in name):
                score += 3

        scored.append((score, t))

    # Sort and take top_k
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:top_k]

    results = []
    for score, t in top:
        try:
            cfg = json.loads(t.get("layout_config") or "{}")
        except Exception:
            cfg = {}
        results.append({
            "template_id": t["template_id"],
            "name": t["name"],
            "category": t["category"],
            "style": t["style"],
            "scenario": t["scenario"],
            "has_3d": t["has_3d"],
            "description": t["description"],
            "tags": cfg.get("tags", []),
            "subcategory": cfg.get("subcategory", ""),
            "complexity": cfg.get("complexity", "medium"),
            "match_score": score,
        })

    if not results:
        return json.dumps({"status": "error", "message": "未找到匹配模板，请运行 seed_dashboard_templates_v3.py 初始化模板库"})

    return json.dumps({
        "status": "success",
        "intent_detected": intent,
        "style_selected": selected_style,
        "query_analysis": {
            "needs_3d": needs_3d,
            "scenario_keyword": selected_scenario,
            "category_target": preferred_category,
        },
        "recommendations": results,
        "usage_tip": f"推荐使用 render_dashboard(template_id='{results[0]['template_id']}', data={{...}}) 渲染第一个推荐模板",
    }, ensure_ascii=False)


@tool("render_dashboard")
def render_dashboard(template_id: str, data: dict) -> str:
    """
    将业务数据注入大屏模板并生成预览链接，供用户在浏览器中查看大屏效果。

    Args:
        template_id: 模板 ID (从 recommend_dashboard_template 获取)
        data: 注入数据字典，可包含 KPI 数值、图表数据、标题等
              例如: {"title": "RCS运营监控", "agv_total": 48, "task_rate": 99.1}

    Returns:
        包含预览链接的 JSON，用户点击链接即可在浏览器中看到大屏效果
    """
    with get_connection(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, category, style, scenario, preview_url, layout_config FROM dashboard_templates WHERE template_id = ?",
            (template_id,)
        )
        row = cursor.fetchone()

    if not row:
        return json.dumps({
            "status": "error",
            "message": f"模板 '{template_id}' 不存在，请先调用 recommend_dashboard_template 获取有效模板 ID"
        })

    row = dict(row)
    encoded_data = urllib.parse.quote(json.dumps(data, ensure_ascii=False))
    preview_link = f"http://localhost:5173/preview?template_id={template_id}&data={encoded_data}"

    # Check if it's an iframe-rendered template (imported from URL)
    try:
        cfg = json.loads(row.get("layout_config") or "{}")
        if cfg.get("render_mode") == "iframe" and cfg.get("source_url"):
            preview_link = cfg["source_url"]
    except Exception:
        pass

    return json.dumps({
        "status": "success",
        "template_name": row["name"],
        "style": row["style"],
        "scenario": row["scenario"],
        "preview_url": preview_link,
        "message": f"✅ 大屏 [{row['name']}] 已生成！点击链接在浏览器查看: {preview_link}",
        "injected_data_keys": list(data.keys()) if isinstance(data, dict) else [],
    }, ensure_ascii=False)


@tool("get_dashboard_stats")
def get_dashboard_stats() -> str:
    """
    获取大屏模板库统计信息。Agent 在不确定用什么模板时可先调用此工具了解库中有什么。

    Returns:
        模板库的完整统计摘要，包含分类数量、风格分布、3D模板数等
    """
    with get_connection(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total FROM dashboard_templates")
        total = cursor.fetchone()["total"]

        cursor.execute("SELECT COUNT(*) as cnt FROM dashboard_templates WHERE has_3d=1 AND is_enabled=1")
        total_3d = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM dashboard_templates WHERE is_enabled=1")
        enabled = cursor.fetchone()["cnt"]

        cursor.execute("SELECT category, COUNT(*) as c FROM dashboard_templates WHERE is_enabled=1 GROUP BY category ORDER BY c DESC")
        by_category = {r["category"]: r["c"] for r in cursor.fetchall()}

        cursor.execute("SELECT style, COUNT(*) as c FROM dashboard_templates WHERE is_enabled=1 GROUP BY style ORDER BY c DESC")
        by_style = {r["style"]: r["c"] for r in cursor.fetchall()}

        cursor.execute("SELECT scenario, COUNT(*) as c FROM dashboard_templates WHERE is_enabled=1 GROUP BY scenario ORDER BY c DESC LIMIT 10")
        top_scenarios = [{"scenario": r["scenario"], "count": r["c"]} for r in cursor.fetchall()]

    category_labels = {
        "digital_twin": "数字孪生",
        "cockpit": "企业驾驶舱",
        "operations": "运营监控",
        "industry": "行业大屏",
        "smart_scene": "智慧场景",
        "visualization": "可视化大屏",
        "kpi_board": "数据看板",
    }
    labeled_categories = {category_labels.get(k, k): v for k, v in by_category.items()}

    return json.dumps({
        "total_templates": total,
        "enabled_templates": enabled,
        "templates_with_3d": total_3d,
        "by_category": labeled_categories,
        "by_style": by_style,
        "top_scenarios": top_scenarios,
        "usage_guide": {
            "step1": "调用 recommend_dashboard_template(query='...', intent='monitoring|cockpit|twin|kpi|showcase') 获取推荐",
            "step2": "调用 render_dashboard(template_id='...', data={...}) 生成预览链接",
            "intent_options": list(INTENT_MAP.keys()),
        }
    }, ensure_ascii=False)
