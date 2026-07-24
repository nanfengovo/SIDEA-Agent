# 解析用户提供的图片意图
# 任务：复刻一张工业指挥调度中心的数字孪生监控界面
# 需要提供的能力：dashboard展示配置

dashboard_config = {
    "title": "朝夕智慧工厂 指挥调试中心",
    "template_id": "zhaoxi-factory",
    "components": [
        {"type": "gauge", "title": "今日能耗监控", "value": 45.6, "unit": "KW"},
        {"type": "chart", "title": "人均产能监控", "data": {"y": [25, 50, 75, 100]}},
        {"type": "alert", "title": "重要报警信息", "status": "active"},
        {"type": "table", "title": "信息查看", "columns": ["巡检路线", "时间", "操作"]},
        {"type": "metric", "title": "厂区环境监控", "items": [
            {"label": "实时温度", "value": 809, "unit": "℃"},
            {"label": "实时湿度", "value": 409, "unit": "%"},
            {"label": "空气质量", "value": 809, "unit": "ug/m3"}
        ]}
    ]
}

print(dashboard_config)
