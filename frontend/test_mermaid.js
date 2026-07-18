import mermaid from 'mermaid';
const chart = `flowchart TD
    A[接收异常/报警] --> B{信息收集与初步判断};
    B --> C[检查物理层: 电源, 接线];
    C -->|OK| D[读取日志 (read_plc_log)];
    D --> E{分析日志: 确定错误类型};
    E --> F[结合实时节点状态 (plc_read) 验证];
    F --> G{定位问题源: 硬件/通信/软件?};
    G -->|硬件| H[更换组件并测试];
    G -->|软件/通信| I[调试代码或修改参数];
    H --> J[系统恢复正常];
    I --> J;`;
mermaid.parse(chart).then(console.log).catch(console.error);
