import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "app_title": "SIDEA Agent",
      "chat_placeholder": "Type your diagnostic issue or command here...",
      "waiting_status": "Awaiting instructions, system standby...",
      "execution_trace": "Execution Trace",
      "theme_dark": "Dark Mode",
      "theme_light": "Light Mode",
      "lang_zh": "中文",
      "lang_en": "English",
      "error_connect": "Failed to connect to backend server.",
      "tool_start": "Calling Tool",
      "tool_end": "Tool Execution Completed",
      "tool_error": "Tool Execution Error",
      "llm_start": "Model Thinking...",
      "llm_end": "Model Thinking Completed",
      "label_model": "Model:",
      "label_role": "Role:",
      "welcome_msg": "SIDEA Agent is online. System on standby, ready to begin intelligent diagnostic analysis for industrial equipment and control systems.",
      "panel_title": "SIDEA Smart Chat",
      "trace_flow": "Execution Flow",
      "trace_logs": "Trace Logs"
    }
  },
  zh: {
    translation: {
      "app_title": "SIDEA 智能体",
      "chat_placeholder": "输入您想诊断的问题或分析指令...",
      "waiting_status": "等待指令，系统待命中...",
      "execution_trace": "执行链路追踪",
      "theme_dark": "深色模式",
      "theme_light": "浅色模式",
      "lang_zh": "中文",
      "lang_en": "English",
      "error_connect": "连接后端失败或发生异常。",
      "tool_start": "正在调用工具",
      "tool_end": "工具调用完成",
      "tool_error": "工具执行发生异常",
      "llm_start": "模型开始思考...",
      "llm_end": "模型思考结束",
      "label_model": "模型:",
      "label_role": "角色:",
      "welcome_msg": "SIDEA Agent 已上线。系统处于待命状态，可以开始对工业设备与控制系统进行智能诊断分析。",
      "panel_title": "SIDEA 智能对话",
      "trace_flow": "可视化链路",
      "trace_logs": "流式日志"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "zh",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
