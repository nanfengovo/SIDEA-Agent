"""Agent Tools — 大屏模板管理与渲染"""
from __future__ import annotations

import json

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from dashboard.template_manager import (
    get_template_stats,
    list_templates,
    recommend_templates,
)
from dashboard.template_renderer import render_dashboard


class ListTemplatesRequest(BaseModel):
    style: str = Field(default="", description="风格筛选: tech-blue/cyberpunk/dark-gold/industrial/holographic/green-matrix/red-alert/minimalist")
    scene: str = Field(default="", description="场景筛选: rcs/warehouse/factory/logistics/cockpit/energy/general")
    has_3d: bool = Field(default=False, description="是否只要含3D/数字孪生的模板")
    keyword: str = Field(default="", description="关键词: 数字孪生/驾驶舱/物流/工厂等")
    limit: int = Field(default=10, description="返回数量")


class RecommendTemplateRequest(BaseModel):
    purpose: str = Field(description="用途描述，如：给领导汇报RCS自动化率、Erack数字孪生监控")
    prefer_3d: bool = Field(default=False, description="是否优先3D数字孪生模板")


class RenderDashboardRequest(BaseModel):
    template_id: str = Field(description="模板ID，如 sidea-rcs-cockpit-v1 或 bdv-049")
    data_json: str = Field(
        default="{}",
        description='注入模板的数据 JSON，含 title/composite_automation_rate/kpi_cards/trend_7d 等槽位',
    )


@tool(args_schema=ListTemplatesRequest)
def list_dashboard_templates(
    style: str = "",
    scene: str = "",
    has_3d: bool = False,
    keyword: str = "",
    limit: int = 10,
) -> str:
    """列出大屏模板库。支持按风格/场景/3D/关键词筛选。用于大屏模板管理。"""
    result = list_templates(
        style=style or None,
        scene=scene or None,
        has_3d=True if has_3d else None,
        keyword=keyword or None,
        limit=limit,
    )
    items = result["items"]
    if not items:
        return "未找到匹配模板。请先调用 sync 或检查筛选条件。"
    lines = [f"共 {result['total']} 个模板，展示 {len(items)} 个：\n"]
    for t in items:
        tag_3d = " [3D孪生]" if t.get("has_3d") else ""
        native = " [可本地渲染]" if t.get("template_type") == "jinja2_native" else ""
        lines.append(
            f"- {t['template_id']}: {t['name']}{tag_3d}{native}\n"
            f"  风格={t['style']} 场景={t['scene']} 来源={t['source_id']}\n"
            f"  预览: {t.get('preview_url', 'N/A')}"
        )
    return "\n".join(lines)


@tool(args_schema=RecommendTemplateRequest)
def recommend_dashboard_template(purpose: str, prefer_3d: bool = False) -> str:
    """根据用途智能推荐大屏模板。Agent将分析数据后套入推荐模板渲染，拉高视觉上限。"""
    items = recommend_templates(purpose, prefer_3d=prefer_3d, limit=5)
    if not items:
        return "暂无推荐模板"
    lines = [f"根据用途「{purpose}」推荐以下模板：\n"]
    for i, t in enumerate(items, 1):
        lines.append(
            f"{i}. [{t['template_id']}] {t['name']}\n"
            f"   风格={t['style']} | 3D={'是' if t.get('has_3d') else '否'} | "
            f"可本地渲染={'是' if t.get('template_type')=='jinja2_native' else '否(外部模板)'}\n"
            f"   适合: {', '.join(t.get('recommended_for') or [])}"
        )
    lines.append("\n选定后请调用 render_dashboard 注入数据渲染。")
    return "\n".join(lines)


@tool(args_schema=RenderDashboardRequest)
def render_dashboard_tool(template_id: str, data_json: str = "{}") -> str:
    """将 RCS/自动化率/KPI 等数据注入大屏模板并渲染。本地模型分析+高级模板=高视觉上限。"""
    try:
        data = json.loads(data_json) if data_json.strip() else {}
    except json.JSONDecodeError:
        return "data_json 格式错误，请提供合法 JSON"
    try:
        result = render_dashboard(template_id, data, save=True)
    except ValueError as e:
        return f"渲染失败: {e}"
    if result.get("render_type") == "native_html":
        return (
            f"✅ 大屏渲染成功！\n"
            f"模板: {result['template_name']}\n"
            f"预览地址: {result.get('preview_url')}\n"
            f"本地文件: {result.get('output_path')}\n"
            f"说明: 数据已注入模板槽位，可直接在浏览器打开预览。"
        )
    return (
        f"📋 外部模板绑定方案已生成\n"
        f"模板: {result['template_name']}\n"
        f"在线预览: {result.get('preview_url')}\n"
        f"源码仓库: {result.get('source_repo')}\n"
        f"3D孪生: {'是' if result.get('has_3d') else '否'}\n"
        f"数据槽位映射: {json.dumps(result.get('data_binding', [])[:5], ensure_ascii=False)}...\n"
        f"提示: 克隆仓库后按 data_binding 将 Agent 分析数据注入对应 DOM/ECharts/Three.js 区域。"
    )


@tool
def get_dashboard_stats() -> str:
    """获取大屏模板库统计：总数、风格分布、3D模板数、可本地渲染数。"""
    stats = get_template_stats()
    lines = [
        f"大屏模板库统计",
        f"总数: {stats['total']} 个",
        f"含3D/数字孪生: {stats['count_3d']} 个",
        f"可本地一键渲染: {stats['count_native_renderable']} 个",
        f"\n风格分布:",
    ]
    for style, count in sorted(stats.get("by_style", {}).items()):
        lines.append(f"  - {style}: {count}")
    lines.append("\n场景分布:")
    for scene, count in sorted(stats.get("by_scene", {}).items()):
        lines.append(f"  - {scene}: {count}")
    return "\n".join(lines)
