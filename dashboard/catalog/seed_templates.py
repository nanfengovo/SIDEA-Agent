"""
大屏模板种子数据 — 全网采集整理
来源: BigDataView / GoView / OneTwin / DataEase / DataRoom / 数字孪生 / SIDEA原生
关键词: 数字孪生、可视化大屏、数据大屏、看板、驾驶舱、企业驾驶舱
"""
from __future__ import annotations

import json
from pathlib import Path

CATALOG_DIR = Path(__file__).parent

# 风格枚举
STYLES = [
    "tech-blue",      # 科技蓝
    "cyberpunk",      # 赛博朋克
    "dark-gold",      # 暗金商务
    "industrial",     # 工业风
    "holographic",    # 全息投影
    "green-matrix",   # 矩阵绿
    "minimalist",     # 极简白
    "red-alert",      # 告警红
]

# 场景枚举
SCENES = [
    "rcs",            # RCS/机器人控制
    "warehouse",      # 智能仓储
    "factory",        # 智能工厂
    "logistics",      # 物流调度
    "cockpit",        # 管理驾驶舱/CXO
    "energy",         # 能源/设备
    "general",        # 通用
]

# RCS 场景通用数据槽位 — Agent 将本地模型分析结果填入这些槽
RCS_DATA_SLOTS = [
    "title",                    # 大屏标题
    "subtitle",                 # 副标题
    "shift_name",               # 班次
    "composite_automation_rate",# 综合自动化率
    "task_completion_rate",     # 任务完成率
    "manual_intervention_rate", # 人工介入率
    "auto_recovery_rate",       # 异常自愈率
    "agv_utilization",          # AGV稼动率
    "erack_utilization",        # Erack利用率
    "active_alarms",            # 当前告警数
    "task_summary",             # 任务汇总 JSON
    "alarm_topn",               # 告警 TopN JSON
    "trend_7d",                 # 7日趋势 JSON
    "erack_status_map",         # Erack 状态矩阵 JSON
    "kpi_cards",                # KPI 卡片组 JSON
    "chart_main",               # 主图表 ECharts option JSON
    "chart_secondary",          # 副图表
    "footer_note",              # 页脚备注
]


def _scene_recommend(scene: str) -> list[str]:
    mapping = {
        "rcs": ["RCS监控", "自动化率"],
        "warehouse": ["仓储", "立库", "Erack"],
        "factory": ["工厂", "产线", "设备"],
        "logistics": ["物流", "AGV", "调度"],
        "cockpit": ["驾驶舱", "CXO", "管理看板"],
        "energy": ["设备", "能耗", "环境"],
        "general": ["通用", "数据展示"],
    }
    return mapping.get(scene, ["通用"])


def _bdv(
    template_id: str,
    name: str,
    style: str,
    scene: str,
    has_3d: bool,
    path_suffix: str,
    priority: int,
) -> dict:
    """BigDataView 模板快捷构造"""
    return {
        "template_id": template_id,
        "source_id": "bigdataview",
        "name": name,
        "style": style,
        "scene": scene,
        "template_type": "html_static",
        "has_3d": has_3d,
        "preview_url": f"https://demo.eiun.net/web/{path_suffix}",
        "local_path": f"external/bigdataview/web/{path_suffix}",
        "recommended_for": _scene_recommend(scene),
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["BigDataView", "HTML5", "ECharts", scene],
        "priority": priority,
    }


# fmt: off
def _build_templates() -> list[dict]:
    return [
    # ========== SIDEA 原生 — RCS 专用（可真正渲染） ==========
    {
        "template_id": "sidea-rcs-cockpit-v1",
        "source_id": "sidea_native",
        "name": "RCS 综合驾驶舱 · 科技蓝",
        "style": "tech-blue",
        "scene": "rcs",
        "template_type": "jinja2_native",
        "has_3d": False,
        "preview_url": "/api/dashboard/preview/sidea-rcs-cockpit-v1",
        "local_path": "native/rcs_cockpit_tech_blue.html",
        "recommended_for": ["自动化率", "班次汇报", "CXO驾驶舱"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["RCS", "驾驶舱", "自动化率", "原生可渲染"],
        "priority": 100,
    },
    {
        "template_id": "sidea-rcs-erack-3d-v1",
        "source_id": "sidea_native",
        "name": "Erack 数字孪生监控 · 工业全息",
        "style": "holographic",
        "scene": "rcs",
        "template_type": "jinja2_native",
        "has_3d": True,
        "preview_url": "/api/dashboard/preview/sidea-rcs-erack-3d-v1",
        "local_path": "native/rcs_erack_3d.html",
        "recommended_for": ["Erack库位", "物料状态", "3D可视化"],
        "data_slots": RCS_DATA_SLOTS + ["erack_3d_config"],
        "tags": ["Erack", "数字孪生", "3D", "物料同步"],
        "priority": 99,
    },
    {
        "template_id": "sidea-rcs-automation-v1",
        "source_id": "sidea_native",
        "name": "自动化率分析大屏 · 暗金",
        "style": "dark-gold",
        "scene": "cockpit",
        "template_type": "jinja2_native",
        "has_3d": False,
        "preview_url": "/api/dashboard/preview/sidea-rcs-automation-v1",
        "local_path": "native/rcs_automation_dark_gold.html",
        "recommended_for": ["自动化率", "趋势分析", "周报"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["自动化率", "趋势", "报表"],
        "priority": 98,
    },
    {
        "template_id": "sidea-rcs-alarm-v1",
        "source_id": "sidea_native",
        "name": "实时告警监控 · 告警红",
        "style": "red-alert",
        "scene": "rcs",
        "template_type": "jinja2_native",
        "has_3d": False,
        "preview_url": "/api/dashboard/preview/sidea-rcs-alarm-v1",
        "local_path": "native/rcs_alarm_red.html",
        "recommended_for": ["告警监控", "异常诊断", "值班大屏"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["告警", "监控", "实时"],
        "priority": 97,
    },
    {
        "template_id": "sidea-rcs-logistics-v1",
        "source_id": "sidea_native",
        "name": "物流调度可视化 · 赛博朋克",
        "style": "cyberpunk",
        "scene": "logistics",
        "template_type": "jinja2_native",
        "has_3d": False,
        "preview_url": "/api/dashboard/preview/sidea-rcs-logistics-v1",
        "local_path": "native/rcs_logistics_cyber.html",
        "recommended_for": ["AGV调度", "任务监控", "物流"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["AGV", "物流", "调度"],
        "priority": 96,
    },

    # ========== 数字孪生 / 3D ==========
    {
        "template_id": "onetwin-smart-factory",
        "source_id": "onetwin",
        "name": "OneTwin 智能工厂数字孪生",
        "style": "industrial",
        "scene": "factory",
        "template_type": "digital_twin_3d",
        "has_3d": True,
        "preview_url": "https://onetwin.cn",
        "local_path": None,
        "recommended_for": ["智能工厂", "产线监控", "3D场景"],
        "data_slots": RCS_DATA_SLOTS + ["scene_api_endpoint", "model_urls"],
        "tags": ["数字孪生", "Three.js", "Cesium", "智能工厂"],
        "priority": 90,
    },
    {
        "template_id": "onetwin-smart-park",
        "source_id": "onetwin",
        "name": "OneTwin 智慧园区孪生",
        "style": "tech-blue",
        "scene": "factory",
        "template_type": "digital_twin_3d",
        "has_3d": True,
        "preview_url": "https://onetwin.cn",
        "local_path": None,
        "recommended_for": ["园区总览", "多建筑监控"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["数字孪生", "智慧园区"],
        "priority": 85,
    },
    {
        "template_id": "meteor3d-iot-dashboard",
        "source_id": "meteor3d",
        "name": "Meteor3D IoT数据大屏",
        "style": "holographic",
        "scene": "factory",
        "template_type": "digital_twin_3d",
        "has_3d": True,
        "preview_url": "http://www.meteor3d.cn",
        "local_path": None,
        "recommended_for": ["IoT监控", "3D+图表融合"],
        "data_slots": RCS_DATA_SLOTS + ["gltf_models"],
        "tags": ["Meteor3D", "IoT", "低代码3D"],
        "priority": 84,
    },
    {
        "template_id": "tvtjs-industrial-twin",
        "source_id": "tvtjs",
        "name": "TvT.js 工业数字孪生框架",
        "style": "industrial",
        "scene": "factory",
        "template_type": "digital_twin_3d",
        "has_3d": True,
        "preview_url": "https://github.com/gioboa/three-vue-tres",
        "local_path": None,
        "recommended_for": ["工业可视化", "二次开发"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["Three.js", "Vue3", "工业"],
        "priority": 83,
    },
    {
        "template_id": "digital-twin-warehouse",
        "source_id": "digital_twin_warehouse",
        "name": "智能仓储3D数字孪生",
        "style": "tech-blue",
        "scene": "warehouse",
        "template_type": "digital_twin_3d",
        "has_3d": True,
        "preview_url": "https://github.com/aguisadventure/Digital-twin",
        "local_path": None,
        "recommended_for": ["立库", "货架", "AGV轨迹"],
        "data_slots": RCS_DATA_SLOTS + ["shelf_layout", "agv_paths"],
        "tags": ["仓储", "AGV", "货架", "Three.js"],
        "priority": 95,
    },
    {
        "template_id": "wcs-agv-dashboard",
        "source_id": "wcs_front",
        "name": "WCS AGV调度监控大屏",
        "style": "tech-blue",
        "scene": "warehouse",
        "template_type": "vue_dashboard",
        "has_3d": False,
        "preview_url": "https://gitee.com/openwcs/wcs-front",
        "local_path": None,
        "recommended_for": ["AGV监控", "任务调度", "地图"],
        "data_slots": RCS_DATA_SLOTS + ["agv_map_data"],
        "tags": ["WCS", "AGV", "地图"],
        "priority": 88,
    },

    # ========== GoView / DataRoom / MES 低代码 ==========
    {
        "template_id": "goview-industrial-default",
        "source_id": "goview",
        "name": "GoView 工业风默认大屏",
        "style": "tech-blue",
        "scene": "factory",
        "template_type": "lowcode_json",
        "has_3d": False,
        "preview_url": "https://gitee.com/dromara/go-view",
        "local_path": None,
        "recommended_for": ["拖拽设计", "快速定制"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["GoView", "低代码", "Vue3"],
        "priority": 80,
    },
    {
        "template_id": "goview-cyber-dashboard",
        "source_id": "goview",
        "name": "GoView 赛博朋克风大屏",
        "style": "cyberpunk",
        "scene": "cockpit",
        "template_type": "lowcode_json",
        "has_3d": False,
        "preview_url": "https://gitee.com/dromara/go-view",
        "local_path": None,
        "recommended_for": ["炫酷展示", "领导参观"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["GoView", "赛博朋克"],
        "priority": 75,
    },
    {
        "template_id": "dataroom-iot-group",
        "source_id": "dataroom",
        "name": "DataRoom IoT大屏分组模板",
        "style": "tech-blue",
        "scene": "factory",
        "template_type": "lowcode_json",
        "has_3d": False,
        "preview_url": "https://github.com/jonehoo/Siwu-IoT-Views",
        "local_path": None,
        "recommended_for": ["多屏管理", "IoT接入"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["DataRoom", "IoT", "分组管理"],
        "priority": 78,
    },
    {
        "template_id": "mes-production-cockpit",
        "source_id": "mes_viz",
        "name": "MES 生产管理驾驶舱",
        "style": "dark-gold",
        "scene": "cockpit",
        "template_type": "lowcode_json",
        "has_3d": False,
        "preview_url": "https://gitee.com/Rong_X/MES",
        "local_path": None,
        "recommended_for": ["生产驾驶舱", "OEE", "产线"],
        "data_slots": RCS_DATA_SLOTS + ["oee_data"],
        "tags": ["MES", "生产", "驾驶舱"],
        "priority": 82,
    },
    {
        "template_id": "dataease-smart-manufacturing",
        "source_id": "dataease",
        "name": "DataEase 智能制造驾驶舱",
        "style": "tech-blue",
        "scene": "factory",
        "template_type": "bi_template",
        "has_3d": False,
        "preview_url": "https://templates.dataease.cn/",
        "local_path": None,
        "recommended_for": ["制造BI", "车间管理"],
        "data_slots": RCS_DATA_SLOTS,
        "tags": ["DataEase", "制造", "BI"],
        "priority": 81,
    },
    {
        "template_id": "dataease-store-cockpit",
        "source_id": "dataease",
        "name": "DataEase 门店销售驾驶舱",
        "style": "minimalist",
        "scene": "cockpit",
        "template_type": "bi_template",
        "has_3d": False,
        "preview_url": "https://templates.dataease.cn/",
        "local_path": None,
        "recommended_for": ["CXO驾驶舱", "销售分析"],
        "data_slots": ["title", "kpi_cards", "chart_main", "chart_secondary"],
        "tags": ["DataEase", "驾驶舱", "CXO"],
        "priority": 70,
    },

    # ========== BigDataView — 工业/物流/工厂相关（精选） ==========
    _bdv("bdv-003", "003 酷炫智能大屏数据中心", "tech-blue", "cockpit", False,
         "003%20%E9%85%B7%E7%82%AB%E6%99%BA%E8%83%BD%E5%A4%A7%E5%B1%8F%E6%95%B0%E6%8D%AE%E4%B8%AD%E5%BF%83", 88),
    _bdv("bdv-011", "011 大数据分析通用模版", "tech-blue", "general", False,
         "011%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E7%B3%BB%E7%BB%9F%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E9%80%9A%E7%94%A8%E6%A8%A1%E7%89%88", 75),
    _bdv("bdv-016", "016 生产数据中心", "industrial", "factory", False,
         "016%20%E6%9F%90%E6%9F%90%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8-%E7%94%9F%E4%BA%A7%E6%95%B0%E6%8D%AE%E4%B8%AD%E5%BF%83", 92),
    _bdv("bdv-026", "026 设备环境监测平台", "green-matrix", "energy", False,
         "026%20%E8%AE%BE%E5%A4%87%E7%8E%AF%E5%A2%83%E7%9B%91%E6%B5%8B%E5%B9%B3%E5%8F%B0", 85),
    _bdv("bdv-031", "031 数据可视化大屏展示系统", "tech-blue", "general", False,
         "031%20%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%A4%A7%E5%B1%8F%E5%B1%95%E7%A4%BA%E7%B3%BB%E7%BB%9F", 80),
    _bdv("bdv-032", "032 物流云数据看板平台", "tech-blue", "logistics", False,
         "032%20%E7%89%A9%E6%B5%81%E4%BA%91%E6%95%B0%E6%8D%AE%E7%9C%8B%E6%9D%BF%E5%B9%B3%E5%8F%B0", 93),
    _bdv("bdv-037", "037 建筑智慧工地管控", "industrial", "factory", False,
         "037%20%E5%BB%BA%E7%AD%91%E6%99%BA%E6%85%A7%E5%B7%A5%E5%9C%B0%E7%AE%A1%E6%8E%A7", 78),
    _bdv("bdv-041", "041 智慧物流服务中心", "tech-blue", "logistics", False,
         "041%20%E6%99%BA%E6%85%A7%E7%89%A9%E6%B5%81%E6%9C%8D%E5%8A%A1%E4%B8%AD%E5%BF%83", 91),
    _bdv("bdv-042", "042 大数据分析系统", "dark-gold", "cockpit", False,
         "042%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E7%B3%BB%E7%BB%9F", 79),
    _bdv("bdv-044", "044 车联网平台数据概览", "cyberpunk", "logistics", False,
         "044%20%E8%BD%A6%E8%81%94%E7%BD%91%E5%B9%B3%E5%8F%B0%E6%95%B0%E6%8D%AE%E6%A6%82%E8%A7%88", 77),
    _bdv("bdv-046", "046 作战指挥室", "red-alert", "cockpit", False,
         "046%20%E4%BD%9C%E6%88%98%E6%8C%87%E6%8C%A5%E5%AE%A4", 86),
    _bdv("bdv-049", "049 工厂信息监控台", "industrial", "factory", False,
         "049%20%E5%B7%A5%E5%8E%82%E4%BF%A1%E6%81%AF%E7%9B%91%E6%8E%A7%E5%8F%B0", 94),
    _bdv("bdv-050", "050 大数据可视化展示平台", "tech-blue", "general", False,
         "050%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E7%A4%BA%E5%B9%B3%E5%8F%B0%E9%80%9A%E7%94%A8%E6%A8%A1%E6%9D%BF", 76),
    _bdv("bdv-055", "055 物流大数据服务平台", "tech-blue", "logistics", False,
         "055%20%E7%89%A9%E6%B5%81%E5%A4%A7%E6%95%B0%E6%8D%AE%E6%9C%8D%E5%8A%A1%E5%B9%B3%E5%8F%B0", 90),
    _bdv("bdv-056", "056 大数据统计展示大屏", "dark-gold", "cockpit", False,
         "056%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%BB%9F%E8%AE%A1%E5%B1%95%E7%A4%BA%E5%A4%A7%E5%B1%8F", 83),
    _bdv("bdv-057", "057 大屏数据统计", "tech-blue", "general", False,
         "057%20%E5%A4%A7%E5%B1%8F%E6%95%B0%E6%8D%AE%E7%BB%9F%E8%AE%A1", 74),
    _bdv("bdv-058", "058 大屏数据智慧中心", "holographic", "cockpit", False,
         "058%20%E5%A4%A7%E5%B1%8F%E6%95%B0%E6%8D%AE%E6%99%BA%E6%85%A7%E4%B8%AD%E5%BF%83%E7%BB%9F%E8%AE%A1", 87),
    _bdv("bdv-059", "059 物联网平台数据统计", "green-matrix", "factory", False,
         "059%20%E7%89%A9%E8%81%94%E7%BD%91%E5%B9%B3%E5%8F%B0%E6%95%B0%E6%8D%AE%E7%BB%9F%E8%AE%A1", 84),
    _bdv("bdv-064", "064 设备环境监测平台", "green-matrix", "energy", False,
         "064%20%E8%AE%BE%E5%A4%87%E7%8E%AF%E5%A2%83%E7%9B%91%E6%B5%8B%E5%B9%B3%E5%8F%B0", 82),
    _bdv("bdv-066", "066 系统架构可视化监控", "cyberpunk", "general", False,
         "066%20%E7%B3%BB%E7%BB%9F%E6%9E%B6%E6%9E%84%E5%8F%AF%E8%A7%86%E5%8C%96%E7%9B%91%E6%8E%A7", 73),
    _bdv("bdv-069", "069 智能看板新中心", "tech-blue", "cockpit", False,
         "069%20%E6%99%BA%E8%83%BD%E7%9C%8B%E6%9D%BF%E6%96%B0%E4%B8%AD%E5%BF%83", 89),
    _bdv("bdv-074", "074 酒机运行状态", "industrial", "factory", False,
         "074%20%E9%85%92%E6%9C%BA%E8%BF%90%E8%A1%8C%E7%8A%B6%E6%80%81", 72),
    _bdv("bdv-079", "079 保税区A仓监控中心", "tech-blue", "warehouse", False,
         "079%20%E4%BF%9D%E7%A8%8E%E5%8C%BAA%E4%BB%93%E7%9B%91%E6%8E%A7%E4%B8%AD%E5%BF%83", 92),
    _bdv("bdv-084", "084 压力容器大屏", "red-alert", "energy", False,
         "084%20%E5%8E%8B%E5%8A%9B%E5%AE%B9%E5%99%A8%E5%A4%A7%E5%B1%8F", 71),
    _bdv("bdv-085", "085 车辆综合管控平台", "tech-blue", "logistics", False,
         "085%20%E8%BD%A6%E8%BE%86%E7%BB%BC%E5%90%88%E7%AE%A1%E6%8E%A7%E5%B9%B3%E5%8F%B0", 88),
    _bdv("bdv-086", "086 物流大数据展示系统", "tech-blue", "logistics", False,
         "086%20%E7%89%A9%E6%B5%81%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%B1%95%E7%A4%BA%E7%B3%BB%E7%BB%9F", 89),
    _bdv("bdv-088", "088 HTML大数据分析平台", "dark-gold", "cockpit", False,
         "088%20HTML%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%BB%BC%E5%90%88%E5%88%86%E6%9E%90%E5%B9%B3%E5%8F%B0%E6%A8%A1%E6%9D%BF", 80),
    _bdv("bdv-090", "090 企业营收大数据统计大屏", "dark-gold", "cockpit", False,
         "090%20%E4%BC%81%E4%B8%9A%E8%90%A5%E6%94%B6%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%BB%9F%E8%AE%A1%E5%8F%AF%E8%A7%86%E5%8C%96%E5%A4%A7%E5%B1%8F", 78),
    _bdv("bdv-092", "092 酷炫大屏数据可视化", "cyberpunk", "general", False,
         "092%20%E9%85%B7%E7%82%AB%E5%A4%A7%E5%B1%8F%E6%95%B0%E6%8D%AE%E5%8F%8F%E8%A7%86%E5%8C%96%E6%A8%A1%E6%9D%BF", 85),
    _bdv("bdv-094", "094 大数据统计展示大屏", "tech-blue", "general", False,
         "094%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%BB%9F%E8%AE%A1%E5%B1%95%E7%A4%BA%E5%A4%A7%E5%B1%8F", 77),
    _bdv("bdv-095", "095 交通大数据展示平台", "tech-blue", "logistics", False,
         "095%20%E4%BA%A4%E9%80%9A%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%B1%95%E7%A4%BA%E5%B9%B3%E5%8F%B0", 76),
    _bdv("bdv-106", "106 茶园大数据指挥舱", "green-matrix", "cockpit", False,
         "106%20%E9%BB%84%E5%B1%B1%E8%8C%B6%E5%9B%AD%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%B9%B3%E5%8F%B0%E6%8C%87%E6%8C%A5%E8%88%B1", 74),
    _bdv("bdv-107", "107 迎新实时大数据看板", "tech-blue", "general", False,
         "107%20%E4%B8%8A%E6%B5%B7XX%E5%A4%A7%E5%AD%A6%E8%BF%8E%E6%96%B0%E5%AE%9E%E6%97%B6%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%9C%8B%E6%9D%BF", 70),
    _bdv("bdv-111", "111 智慧消防大屏", "red-alert", "energy", False,
         "111%20%E6%99%BA%E6%85%A7%E6%B6%88%E9%98%B2%E5%A4%A7%E5%B1%8F", 73),
    _bdv("bdv-114", "114 共享单车运营管理平台", "minimalist", "logistics", False,
         "114%20HELLO%E5%85%B1%E4%BA%AB%E5%8D%95%E8%BD%A6%E8%BF%90%E8%90%A5%E7%AE%A1%E7%90%86%E5%B9%B3%E5%8F%B0", 68),
    _bdv("bdv-005", "005 可视化监控管理", "tech-blue", "general", False,
         "005%20%E5%8F%AF%E8%A7%86%E5%8C%96%E7%9B%91%E6%8E%A7%E7%AE%A1%E7%90%86", 79),
    _bdv("bdv-009", "009 某公司大数据监控平台", "dark-gold", "cockpit", False,
         "009%20%E6%9F%90%E5%85%AC%E5%8F%B8%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%9B%91%E6%8E%A7%E5%B9%B3%E5%8F%B0", 81),
    _bdv("bdv-014", "014 时实客流量监控中心", "holographic", "general", False,
         "014%20%E6%97%B6%E5%AE%9E%E5%AE%A2%E6%B5%81%E9%87%8F%E7%9B%91%E6%8E%A7%E4%B8%AD%E5%BF%83", 72),
    _bdv("bdv-018", "018 大数据分析通用模版II", "tech-blue", "general", False,
         "018%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E7%B3%BB%E7%BB%9F%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E9%80%9A%E7%94%A8%E6%A8%A1%E7%89%88", 74),
    _bdv("bdv-025", "025 大数据可视化展板通用模板", "tech-blue", "general", False,
         "025%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E6%9D%BF%E9%80%9A%E7%94%A8%E6%A8%A1%E6%9D%BF", 73),
    _bdv("bdv-048", "048 大数据可视化展板通用模板II", "dark-gold", "general", False,
         "048%20%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E6%9D%BF%E9%80%9A%E7%94%A8%E6%A8%A1%E6%9D%BF", 72),
    _bdv("bdv-051", "051 通用大数据可视化平台", "tech-blue", "general", False,
         "051%20%E9%80%9A%E7%94%A8%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E7%A4%BA%E5%B9%B3%E5%8F%B0%E6%A8%A1%E6%9D%BF", 71),
    _bdv("bdv-053", "053 通用大数据可视化平台II", "holographic", "cockpit", False,
         "053%20%E9%80%9A%E7%94%A8%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E7%A4%BA%E5%B9%B3%E5%8F%B0%E6%A8%A1%E6%9D%BF", 70),
    _bdv("bdv-054", "054 公安大数据监控平台", "red-alert", "general", False,
         "054%20%E5%85%AC%E5%AE%89%E5%A4%A7%E6%95%B0%E6%8D%AE%E7%9B%91%E6%8E%A7%E5%B9%B3%E5%8F%B0", 69),
    _bdv("bdv-062", "062 数据概览演示案例", "minimalist", "cockpit", False,
         "062%20%E6%95%B0%E6%8D%AE%E6%A6%82%E8%A7%88%E6%BC%94%E7%A4%BA%E6%A1%88%E4%BE%8B", 75),
    _bdv("bdv-063", "063 商品运营大数据", "dark-gold", "cockpit", False,
         "063%20%E5%95%86%E5%93%81%E8%BF%90%E8%90%A5%E5%A4%A7%E6%95%B0%E6%8D%AE", 74),
    _bdv("bdv-075", "075 数据可视化展示", "tech-blue", "general", False,
         "075%20%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%B1%95%E7%A4%BA", 73),
    _bdv("bdv-097", "097 程序员数据可视化大屏", "cyberpunk", "general", False,
         "097%20%E7%A8%8B%E5%BA%8F%E5%91%98%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96%E5%A4%A7%E5%B1%8F%E5%B1%95%E7%A4%BA", 76),
    _bdv("bdv-098", "098 销售大数据分析", "dark-gold", "cockpit", False,
         "098%20%E9%94%80%E5%94%AE%E5%A4%A7%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90", 75),
    _bdv("bdv-100", "100 新型大屏模板", "holographic", "general", False,
         "100%20%E6%96%B0%E5%9E%8B%E5%86%A0%E7%8A%B6%E7%97%85%E6%88%92%E5%AE%9E%E6%97%B6%E7%9B%91%E6%B5%8B%E5%A4%A7%E5%B1%8F", 67),
    ]
# fmt: on

TEMPLATES: list[dict] = _build_templates()


def export_catalog_json():
    """导出完整目录到 JSON 文件"""
    out = CATALOG_DIR / "templates.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(TEMPLATES, f, ensure_ascii=False, indent=2)
    print(f"Exported {len(TEMPLATES)} templates to {out}")


if __name__ == "__main__":
    export_catalog_json()
