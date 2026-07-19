
from sidea_sdk import export_dashboard

charts = [
    {
        "type": "raw",
        "title": "厂区仿真地图",
        "title_en": "Factory Simulation Map",
        "data": {
            "description": "中央大幅厂区仿真地图（存储区/充电区/接驳区分区色块，10 台左右 AMR 按忙碌/空闲/充电/故障着色并带动画，任务路径流动箭头）",
            "amr_count": 10,
            "zones": ["storage", "charging", "transfer"],
            "amr_states": ["busy", "idle", "charging", "fault"],
            "animations": True,
            "task_paths": True,
            "faulty_amr_id": "AMR005",
            "faulty_zone": "storage"
        }
    },
    {
        "type": "bar3d",
        "title": "库区负载图",
        "title_en": "Warehouse Load 3D View",
        "x_size": 8,
        "y_size": 8,
        "data": [
            {"x": 1, "y": 1, "z": 80},
            {"x": 2, "y": 3, "z": 90},
            {"x": 3, "y": 5, "z": 98},
            {"x": 4, "y": 7, "z": 75},
            {"x": 5, "y": 2, "z": 85},
            {"x": 6, "y": 4, "z": 92},
            {"x": 7, "y": 6, "z": 88},
            {"x": 8, "y": 8, "z": 70}
        ],
        "warning_threshold": 95
    },
    {
        "type": "combo",
        "title": "稼动率与自动化率",
        "title_en": "Operation Rate & Automation Rate",
        "x_data": ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"],
        "series": [
            {"name": "稼动率", "type": "line", "data": [85, 88, 90, 92, 91, 93, 94, 95]},
            {"name": "自动化率", "type": "bar", "yAxisIndex": 1, "data": [70, 72, 75, 78, 80, 82, 85, 88]}
        ]
    },
    {
        "type": "line",
        "title": "今日任务完成数与效率",
        "title_en": "Today's Task Completion & Efficiency",
        "x_data": ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"],
        "series": [
            {"name": "任务完成数", "type": "line", "data": [50, 60, 75, 90, 110, 130, 150, 170]},
            {"name": "效率", "type": "line", "data": [80, 82, 85, 88, 90, 91, 93, 94]}
        ]
    },
    {
        "type": "pie",
        "title": "机器人状态分布",
        "title_en": "Robot Status Distribution",
        "data": [
            {"name": "忙碌", "value": 6},
            {"name": "空闲", "value": 3},
            {"name": "充电", "value": 0},
            {"name": "故障", "value": 1}
        ]
    }
]

export_dashboard("RCS AMR 任务执行监控", charts, style="dark industrial sci-fi")
