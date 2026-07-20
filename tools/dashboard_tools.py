"""Agent Tools — 大屏模板管理与渲染"""
from __future__ import annotations

import json

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from dashboard.store import get_stats, list_templates, recommend_templates
from dashboard.template_renderer import render_dashboard


class ListTemplatesRequest(BaseModel):
    style: str = Field(default="", description="风格: tech-blue/cyberpunk/dark-gold 等")
    scene: str = Field(default="", description="场景: rcs/warehouse/factory/logistics/cockpit")
    has_3d: bool = Field(default=False, description="是否只要含3D/数字孪生的模板")
    keyword: str = Field(default="", description="关键词搜索")
    limit: int = Field(default=10, description="返回数量")


class RecommendTemplateRequest(BaseModel):
    purpose: str = Field(description="用途，如：RCS自动化率驾驶舱、立体库数字孪生")
    prefer_3d: bool = Field(default=False, description="是否优先3D模板")


class RenderDashboardRequest(BaseModel):
    template_id: str = Field(description="模板ID，如 stereo-warehouse / amr-command-center")
    data_json: str = Field(default="{}", description="注入模板的 JSON 数据")


@tool(args_schema=ListTemplatesRequest)
def list_dashboard_templates(
    style: str = "",
    scene: str = "",
    has_3d: bool = False,
    keyword: str = "",
    limit: int = 10,
) -> str:
    """列出大屏看板模板库，支持风格/场景/3D/关键词筛选。"""
    result = list_templates(
        style=style or None,
        scene=scene or None,
        has_3d=True if has_3d else None,
        keyword=keyword or None,
        limit=limit,
    )
    items = result["items"]
    if not items:
        return "未找到匹配模板。"
    lines = [f"共 {result['total']} 个模板：\n"]
    for t in items:
        tags = []
        if t.get("has_3d"):
            tags.append("3D")
        if t.get("has_dashboard_json"):
            tags.append("可预览")
        tag_str = f" [{','.join(tags)}]" if tags else ""
        lines.append(
            f"- {t['template_id']}: {t['name']}{tag_str}\n"
            f"  风格={t['style']} 分类={t.get('category_name', t.get('category_id'))}"
        )
    return "\n".join(lines)


@tool(args_schema=RecommendTemplateRequest)
def recommend_dashboard_template(purpose: str, prefer_3d: bool = False) -> str:
    """根据用途智能推荐大屏模板，本地模型分析数据 + 高级模板 = 高视觉上限。"""
    items = recommend_templates(purpose, prefer_3d=prefer_3d, limit=5)
    if not items:
        return "暂无推荐模板"
    lines = [f"用途「{purpose}」推荐：\n"]
    for i, t in enumerate(items, 1):
        lines.append(
            f"{i}. [{t['template_id']}] {t['name']} "
            f"(3D={'是' if t.get('has_3d') else '否'}, 可预览={'是' if t.get('has_dashboard_json') else '否'})"
        )
    lines.append("\n调用 render_dashboard 注入数据后预览。")
    return "\n".join(lines)


@tool(args_schema=RenderDashboardRequest)
def render_dashboard_tool(template_id: str, data_json: str = "{}") -> str:
    """将分析数据注入大屏模板并渲染。返回 preview_url 供用户查看。"""
    try:
        data = json.loads(data_json) if data_json.strip() else {}
    except json.JSONDecodeError:
        return "data_json 格式错误"
    try:
        result = render_dashboard(template_id, data, save=True)
    except ValueError as e:
        return f"渲染失败: {e}"
    if result.get("render_type") == "json_dashboard":
        return (
            f"✅ 大屏渲染成功\n"
            f"模板: {result['template_name']}\n"
            f"预览: GET /api/templates/{template_id}\n"
            f"说明: 数据已合并到 dashboard JSON，可在管理后台预览或嵌入聊天。"
        )
    return (
        f"外链模板: {result.get('template_name')}\n"
        f"预览: {result.get('preview_url')}\n"
        f"{result.get('message', '')}"
    )


@tool
def get_dashboard_stats() -> str:
    """获取大屏模板库统计信息。"""
    stats = get_stats()
    lines = [
        f"模板总数: {stats['total']}",
        f"含3D: {stats['count_3d']}",
        "分类:",
    ]
    for cat, n in stats.get("by_category", {}).items():
        lines.append(f"  {cat}: {n}")
    return "\n".join(lines)
