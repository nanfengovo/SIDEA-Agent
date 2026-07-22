import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Activity, User, Settings, Database, Server, RefreshCw } from 'lucide-react';
import { Table, Tag, Modal, Button, Radio, message } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { getApiUrl } from '../config';

interface SystemLogsPanelProps {
  onExit: () => void;
  initialRuleId?: string | null;
}

const SystemLogsPanel: React.FC<SystemLogsPanelProps> = ({ onExit, initialRuleId }) => {
  const { i18n } = useTranslation();
  const { language, theme } = useAppStore();
  const activeLang = language || i18n.language;
  const isDark = theme === 'dark';

  const isZh = /zh|中文|简|繁/i.test(activeLang || '');
  const L = (zh: string, en: string) => (isZh ? zh : en);

  const [logs, setLogs] = useState<any[]>([]);
  const [filterRuleId, setFilterRuleId] = useState<string | null>(initialRuleId || null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>('ALL');
  const [previewData, setPreviewData] = useState<string | null>(null);

  const fetchLogs = async (cat: string) => {
    setLoading(true);
    try {
      let url = `${getApiUrl()}/admin/system_logs?limit=500`;
      if (cat !== 'ALL') {
        url += `&category=${cat}`;
      }
      const res = await fetch(url);
      let data = await res.json();
      
      if (filterRuleId) {
        data = data.filter((item: any) => item.raw_data_json?.includes(filterRuleId));
      }
      
      setLogs(data);
    } catch (e) {
      console.error(e);
      message.error(L("无法加载系统日志", "Failed to load system logs"));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs(category);
  }, [category, filterRuleId]);

  const getCategoryTag = (cat: string) => {
    switch(cat) {
      case 'HUMAN_OP': return <Tag color="blue" icon={<User size={12} className="mr-1 inline"/>}>{L('人工操作', 'Human Op')}</Tag>;
      case 'AUTO_TASK': return <Tag color="purple" icon={<Settings size={12} className="mr-1 inline"/>}>{L('自动任务', 'Auto Task')}</Tag>;
      case 'API_IN': return <Tag color="cyan" icon={<Server size={12} className="mr-1 inline"/>}>{L('入站请求', 'API In')}</Tag>;
      case 'API_OUT': return <Tag color="orange" icon={<Database size={12} className="mr-1 inline"/>}>{L('出站请求', 'API Out')}</Tag>;
      default: return <Tag>{cat}</Tag>;
    }
  };

  const columns = [
    { title: L('分类', 'Category'), dataIndex: 'category', key: 'category', render: (c: string) => getCategoryTag(c), width: 120 },
    { title: L('操作动作', 'Action'), dataIndex: 'action', key: 'action', render: (t: string) => <span className={`font-mono text-xs ${isDark ? 'text-cyan-300' : 'text-cyan-700 font-bold'}`}>{t}</span>, width: 180 },
    { title: L('描述', 'Description'), dataIndex: 'description', key: 'description', render: (t: string) => <span className={isDark ? 'text-slate-200' : 'text-slate-900 font-normal'}>{t}</span> },
    { title: L('状态', 'Status'), dataIndex: 'status', key: 'status', render: (s: string) => s === 'success' ? <Tag color="success">{L('成功', 'Success')}</Tag> : <Tag color="error">{L('失败', 'Failed')}</Tag>, width: 80 },
    { title: L('时间', 'Time'), dataIndex: 'created_at', key: 'created_at', render: (t: string) => dayjs(t).format('MM-DD HH:mm:ss'), width: 140 },
    { title: L('详情', 'Details'), key: 'details', width: 80, render: (_: any, r: any) => (
      r.raw_data_json ? (
        <Button size="small" type="link" onClick={() => {
          try {
            setPreviewData(JSON.stringify(JSON.parse(r.raw_data_json), null, 2));
          } catch(e) {
            setPreviewData(r.raw_data_json);
          }
        }}>{L('查看', 'View')}</Button>
      ) : <span className="text-gray-400 text-xs">{L('无', 'None')}</span>
    )}
  ];

  const panelBgClass = isDark
    ? "bg-[#1a1b26]/95 border-[var(--border-color)] text-white shadow-2xl"
    : "bg-white/95 border-slate-200 text-slate-900 shadow-2xl";

  const headerBgClass = isDark ? "bg-black/30 border-b border-white/10" : "bg-slate-100/90 border-b border-slate-200";

  const getPaginationConfig = (pageSize = 15) => ({
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: ['10', '15', '30', '50', '100'],
    showTotal: (total: number) => L(`共 ${total} 条`, `Total ${total} items`),
    position: ['bottomRight'] as ('bottomRight')[],
    showQuickJumper: true
  });

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`absolute inset-4 z-50 flex flex-col rounded-2xl overflow-hidden backdrop-blur-xl border ${panelBgClass}`}
    >
      <div className={`flex justify-between items-center px-6 py-4 ${headerBgClass}`}>
        <div className="flex items-center gap-3">
          <Activity className={isDark ? "text-[var(--accent-cyan)] w-6 h-6" : "text-cyan-600 w-6 h-6"} />
          <h2 className={`text-xl font-bold m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{L('系统操作日志中心', 'System Audit Log Center')}</h2>
        </div>
        <button onClick={onExit} className={`p-2 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}>
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
        <div className={`flex justify-between items-center p-3 rounded-lg border ${isDark ? 'bg-black/30 border-slate-700' : 'bg-slate-50 border-slate-300'}`}>
          <Radio.Group 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="ALL">{L('全部日志', 'All Logs')}</Radio.Button>
            <Radio.Button value="HUMAN_OP"><User size={14} className="inline mr-1"/> {L('人工操作', 'Human Ops')}</Radio.Button>
            <Radio.Button value="AUTO_TASK"><Settings size={14} className="inline mr-1"/> {L('自动任务', 'Auto Tasks')}</Radio.Button>
            <Radio.Button value="API_IN"><Server size={14} className="inline mr-1"/> {L('入站请求', 'API In')}</Radio.Button>
            <Radio.Button value="API_OUT"><Database size={14} className="inline mr-1"/> {L('出站请求', 'API Out')}</Radio.Button>
          </Radio.Group>
          
          <div className="flex gap-2">
            {filterRuleId && (
              <Button danger type="dashed" onClick={() => setFilterRuleId(null)}>
                {L('清除当前规则过滤', 'Clear Filter')}
              </Button>
            )}
            <Button icon={<RefreshCw size={14} />} onClick={() => fetchLogs(category)}>{L('刷新', 'Refresh')}</Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table 
            dataSource={logs} 
            columns={columns} 
            rowKey="id"
            loading={loading}
            pagination={getPaginationConfig(15)}
            className={isDark ? "custom-dark-table" : "custom-light-table"}
            size="small"
          />
        </div>
      </div>

      <Modal
        title={L("详细数据 (JSON)", "Raw Data (JSON)")}
        open={!!previewData}
        onCancel={() => setPreviewData(null)}
        footer={null}
        width={700}
        className={isDark ? "custom-dark-modal" : ""}
      >
        <pre className="bg-slate-900 p-4 rounded-lg overflow-auto max-h-[60vh] text-emerald-400 text-xs font-mono">
          {previewData}
        </pre>
      </Modal>
    </motion.div>
  );
};

export default SystemLogsPanel;
