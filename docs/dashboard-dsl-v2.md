# Dashboard DSL v2 & 三档出图

SIDEA 大屏协议从「完整 ECharts option」升级为 **Widget 组件库 + 声明式数据绑定**，并按模型能力分三档。

## 三档策略

| 档位 | 何时启用 | 产物 | 视觉上限 |
| --- | --- | --- | --- |
| `template` | 小模型 / Ollama | DSL v2 JSON（固定 widget + 填数） | 前端组件库 |
| `freeform` | 商业/强模型 | LLM 编排 DSL `layout`+`data` | 组件库 + `custom_echarts` |
| `scene` | 商业模型 + 3D/数字孪生意图 | `sandbox_workspace/scene_*.html` | 默认 Pixi 2.5D；真 3D 用 Three.js |

判定逻辑见 `integrations/llm/capability_tier.py`。可在 LLM Profile 的 `extra_config.dashboard_tier` 强制覆盖。

### 沉浸档（scene）流程

1. Agent 拆分子任务（空间 / 车队 / 路径 / HUD）
2. 商业模型生成场景 JSON（货架、AMR、路径、KPI）
3. 注入 `tools/scene_scaffold.html`（CDN Three.js）
4. 静态审核（体积、脚本源、危险标签）
5. 聊天交付 `````scene-html` URL，前端 **sandbox iframe** 渲染

后续可扩展为沙箱内 React/Vue/Unity 工程构建，交付协议仍是 scene URL。

## 文档形状（DSL v2）

```json
{
  "type": "dashboard",
  "dsl_version": 2,
  "title": "RCS AMR 任务执行监控大屏",
  "template": "amr_command_center",
  "theme": "dark-industrial",
  "layout": [
    {"id": "kpis", "widget": "kpi_strip", "data_ref": "kpis", "slot": "kpi"},
    {"id": "floor", "widget": "amr_floor_map", "data_ref": "floor", "slot": "hero", "span": {"col": 2, "row": 2}}
  ],
  "data": {
    "kpis": [{"label": "今日任务", "value": 1286, "delta": "+12%", "tone": "cyan"}],
    "floor": {"zones": [], "robots": [], "routes": []}
  },
  "insights": ["..."]
}
```

## 已注册 Widget

| widget | 数据形态 | 说明 |
| --- | --- | --- |
| `dashboard_header` | `{subtitle,status,clock}` | 顶栏 LIVE 指示 |
| `kpi_strip` | `KpiItem[]` | HTML/CSS 数字卡 |
| `gauge_pair` | `{left,right}` | 双仪表盘（内部转 ECharts） |
| `trend_combo` | `{x,series}` | 双轴趋势 |
| `status_donut` | `StatusSlice[]` | 环形状态 |
| `amr_floor_map` | `{zones,robots,routes}` 或 `{option}` | ECharts 平面地图（兼容） |
| `amr_iso_map` | `{zones,robots,routes}` | **PixiJS 2.5D 等轴测**（默认英雄位） |
| `bar3d_load` | grid / option | 3D 负载 |
| `custom_echarts` | `{option}` | 商业档逃生舱 |

### 沉浸档引擎

| engine | 脚手架 | 何时 |
| --- | --- | --- |
| `pixi`（默认） | `tools/scene_scaffold_pixi.html` | 精致厂区大屏 / 数字孪生 |
| `three` | `tools/scene_scaffold.html` | 明确要求真 3D / WebGL / Unity |

## 兼容

- 旧 Panel Array（`panels[].option`）仍由 `DashboardGrid` 渲染
- `agent/dashboard_dsl.py::from_legacy_panels` / `frontend/src/dashboard/compat.ts` 可转换为 DSL v2
- 原生 `dsl_version: 2` 由 `DashboardV2` + Widget Registry 渲染
- Goal Pipeline 模板/自由档默认写出 DSL v2；场景档写出 HTML

## 试用

```bash
python scripts/demo_dsl_v2.py
pytest tests/test_dashboard_dsl.py tests/test_scene_pipeline.py -q
```

聊天中粘贴 DSL：

````md
```echarts-i18n
http://localhost:8000/sandbox_workspace/demo_dsl_v2.json
```
````

场景交付：

````md
```scene-html
http://localhost:8000/sandbox_workspace/scene_....html
```
````

触发沉浸档示例话术（需商业模型 Profile）：「做一套精致的 3D 数字孪生厂区场景」。

## 代码位置

- Python schema：`agent/dashboard_dsl.py`
- 场景流水线：`agent/scene_pipeline.py` + `tools/scene_scaffold.html`
- Goal 路由：`agent/goal_pipeline.py` → `detect_dashboard_tier(..., message=)`
- 前端：`frontend/src/dashboard/`、`MarkdownRenderer`（DSL / iframe）
