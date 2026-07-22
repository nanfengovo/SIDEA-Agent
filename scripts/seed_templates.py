import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.db")

def seed_templates():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 50 款工业大屏可视化模板库 (覆盖 AMHS/RCS/WMS/AGV/3D地图 等)
    templates = [
        # 1. AMHS (自动化物料搬运系统) - 7款
        ("amhs_oht_track", "OHT 轨道全景监控", "AMHS", "天车 OHT 轨道监控，包含路网热力图与拥堵预警", {"layout": "twin_center", "hero": "track_map"}),
        ("amhs_foup_dist", "FOUP 载具分布图", "AMHS", "光刻/刻蚀各车间 FOUP 实时分布与在途时间分析", {"layout": "industrial_4panel"}),
        ("amhs_lifter_status", "跨楼层提升机状态", "AMHS", "Lifter 运行速率、能耗与故障率统计", {"layout": "kpi_dashboard"}),
        ("amhs_traffic_heatmap", "物流拥堵热力图", "AMHS", "实时拥堵节点分析与绕行建议", {"layout": "simple_grid", "cols": 2}),
        ("amhs_throughput_kpi", "天车系统吞吐量 KPI", "AMHS", "管理层视角的系统总体吞吐能力板", {"layout": "kpi_dashboard"}),
        ("amhs_stocker_fill", "Stocker 满载率", "AMHS", "微型立体库(Stocker)实时存储率与存取效率", {"layout": "industrial_4panel"}),
        ("amhs_alarm_timeline", "AMHS 告警时间线", "AMHS", "历史故障追踪与停机时间 (Downtime) 分析", {"layout": "timeline_monitor"}),
        
        # 2. RCS/MCS (机器人/物料控制系统) - 8款
        ("rcs_fleet_overview", "AMR 集群调度总览", "RCS", "机器人整体状态、任务执行率、在线/离线占比", {"layout": "industrial_4panel"}),
        ("rcs_task_mph", "集群任务吞吐量 (MPH)", "RCS", "每小时搬运任务数趋势与达标率", {"layout": "simple_grid", "cols": 1}),
        ("rcs_path_deadlock", "多设备路径死锁预警", "RCS", "路口死锁预测网络图与疏通方案", {"layout": "twin_center"}),
        ("rcs_order_trace", "实时订单下发链路", "RCS", "从 MES -> MCS -> RCS 的订单流转甘特图", {"layout": "timeline_monitor"}),
        ("mcs_material_flow", "车间物料流转图", "MCS", "工序间物料流向与线边仓拉动率", {"layout": "industrial_4panel"}),
        ("rcs_battery_kpi", "集群电池健康度", "RCS", "充放电周期统计与电池寿命衰减散点图", {"layout": "kpi_dashboard"}),
        ("rcs_map_coverage", "导航地图覆盖率", "RCS", "建图完整度与定位置信度热力分布", {"layout": "simple_grid", "cols": 2}),
        ("rcs_error_radar", "系统异常雷达图", "RCS", "调度/导航/通信等多维度异常分布", {"layout": "simple_grid", "cols": 2}),
        
        # 3. WMS/WCS (仓储系统) - 7款
        ("wms_3d_warehouse", "3D 立体库全景", "WMS", "全自动立体库 3D 仿真与货位透视", {"layout": "twin_center", "hero": "3d_webgl"}),
        ("wms_shelf_usage", "货架满载率面板", "WMS", "各分区存储利用率与冷热库位统计", {"layout": "industrial_4panel"}),
        ("wcs_stacker_crane", "堆垛机运行轨迹", "WCS", "堆垛机 X/Y/Z 轴实时位置与振动波形", {"layout": "kpi_dashboard"}),
        ("wms_inout_eff", "进出库效率追踪", "WMS", "按小时/班次的收发货效率折线图", {"layout": "simple_grid", "cols": 2}),
        ("wms_inventory_abc", "库存 ABC 分析图", "WMS", "高价值物料周转率帕累托图", {"layout": "industrial_4panel"}),
        ("wms_agv_docking", "AGV 进出库接驳点", "WMS", "接驳点排队长度与等待超时告警", {"layout": "timeline_monitor"}),
        ("wcs_conveyor_belt", "传送带流转监控", "WCS", "多段传送带启停状态与堵料识别", {"layout": "simple_grid", "cols": 3}),
        
        # 4. AMR/AGV/ARV 调度监控 - 7款
        ("agv_radar_2d", "全局 2D 动态雷达定位", "AGV", "厂区平面 2D 地图与小车实时坐标", {"layout": "twin_center"}),
        ("amr_charge_curve", "电池充放电曲线", "AMR", "单车电压/电流趋势及低电量预警", {"layout": "simple_grid", "cols": 2}),
        ("agv_fault_dist", "故障报警雷达分布", "AGV", "避障/急停/掉线等故障频次统计", {"layout": "industrial_4panel"}),
        ("arv_lifting_stats", "顶升机构作业统计", "ARV", "货架顶升次数、耗时及机构磨损评估", {"layout": "kpi_dashboard"}),
        ("amr_laser_scan", "激光雷达实时点云", "AMR", "单车激光点云数据 2D 俯视截面", {"layout": "simple_grid", "cols": 1}),
        ("agv_wifi_signal", "Wi-Fi 漫游信号强度", "AGV", "AP 切换丢包率与全厂信号盲区地图", {"layout": "twin_center"}),
        ("amr_payload_weight", "小车动态载重监控", "AMR", "空载/满载/超载状态实时占比", {"layout": "industrial_4panel"}),

        # 5. 工厂数字孪生 (Digital Twin) - 6款
        ("twin_fab_3d", "车间全景 3D 俯视大屏", "DigitalTwin", "整个厂房的宏观 3D 渲染与设备概览", {"layout": "twin_center", "hero": "3d_factory"}),
        ("twin_equip_internal", "设备内构工艺透视", "DigitalTwin", "单台核心机台内部关键部件的 3D 透视", {"layout": "simple_grid", "cols": 2}),
        ("twin_temp_3d", "机台温度场 3D 柱状图", "DigitalTwin", "烘烤/扩散等热力工艺的空间温度分布", {"layout": "industrial_4panel"}),
        ("twin_gas_pipe", "特气管网 3D 追踪", "DigitalTwin", "危险气体管道压力及泄漏扩散仿真", {"layout": "twin_center"}),
        ("twin_cleanroom", "无尘室环境 3D 监控", "DigitalTwin", "FFU 转速、温湿度及微粒浓度云图", {"layout": "industrial_4panel"}),
        ("twin_personnel", "人员定位与安全围栏", "DigitalTwin", "外包/访客实时轨迹及危险区禁入告警", {"layout": "twin_center"}),

        # 6. 产线 OEE & 能耗监控 - 6款
        ("oee_equip_util", "机台综合利用率 (OEE)", "OEE", "可用性、表现性、质量指数瀑布图", {"layout": "kpi_dashboard"}),
        ("quality_spc", "次品率 SPC 控制图", "Quality", "良率波动趋势及 3-Sigma 预警上下限", {"layout": "simple_grid", "cols": 1}),
        ("energy_water_gas", "水电气能耗管网追踪", "Energy", "单日峰谷电耗与综合单位产量能耗比", {"layout": "industrial_4panel"}),
        ("oee_bottleneck", "产线瓶颈工序识别", "OEE", "各站 WIP 堆积情况与 Cycle Time 分析", {"layout": "twin_center"}),
        ("sensor_vib_temp", "震动/温度时序双轴图", "OEE", "关键轴承的温度与震动高频采样比对", {"layout": "industrial_4panel"}),
        ("carbon_emission", "碳排放实时看板", "Energy", "等效碳排放折线与环保合规度指示", {"layout": "kpi_dashboard"}),

        # 7. Predictive Maintenance (预测性维护) - 5款
        ("pm_tool_life", "刀具磨损寿命预测", "Maintenance", "基于机器学习的剩余使用寿命 (RUL) 曲线", {"layout": "simple_grid", "cols": 2}),
        ("pm_noise_scatter", "异常噪音/震动散点图", "Maintenance", "频谱特征提取与异常离群点识别", {"layout": "industrial_4panel"}),
        ("pm_maint_timeline", "设备维保时间线", "Maintenance", "过去维修记录与未来保养计划日历", {"layout": "timeline_monitor"}),
        ("pm_spare_parts", "备件库存预警模型", "Maintenance", "基于消耗速率预测的备件采购建议", {"layout": "kpi_dashboard"}),
        ("pm_health_score", "机台综合健康度打分", "Maintenance", "多维传感器数据融合的健康雷达图", {"layout": "simple_grid", "cols": 3}),

        # 8. 管理层全局驾驶舱 - 4款
        ("exec_global_kpi", "多基地 KPI 汇总卡片", "Executive", "集团视角下各分厂的核心经营指标", {"layout": "kpi_dashboard"}),
        ("exec_cost_analysis", "生产成本极简网格", "Executive", "良率损失、能耗成本与人工成本拆解", {"layout": "simple_grid", "cols": 4}),
        ("exec_order_fulfill", "订单交付达成率", "Executive", "大客户订单交期预测与延期风险", {"layout": "industrial_4panel"}),
        ("exec_safety_board", "安全生产天数看板", "Executive", "无事故天数、微小工伤统计与安全指数", {"layout": "kpi_dashboard"})
    ]

    print(f"Checking DB: {DB_PATH}")
    for tpl in templates:
        template_id, name, category, desc, layout = tpl
        layout_json = json.dumps(layout, ensure_ascii=False)
        cursor.execute("SELECT 1 FROM dashboard_templates WHERE template_id = ?", (template_id,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO dashboard_templates (template_id, name, category, description, layout_config, is_enabled)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (template_id, name, category, desc, layout_json))
            print(f"Inserted: {template_id}")
    
    conn.commit()
    conn.close()
    print(f"Successfully seeded {len(templates)} templates.")

if __name__ == "__main__":
    seed_templates()
