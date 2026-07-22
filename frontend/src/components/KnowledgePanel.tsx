import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud, FileText, Trash2, CheckCircle, XCircle, Brain, RefreshCw, Eye, Edit, Settings, Activity, Layers, Share2, Search, ZoomIn, ZoomOut, Maximize2, Sliders } from 'lucide-react';
import { Tabs, Table, Button, Upload, message, Popconfirm, Tag, Modal, Form, Input, Switch, Slider, Select } from 'antd';
import type { UploadProps } from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { getApiUrl, getBaseUrl } from '../config';

interface KnowledgePanelProps {
  onExit: () => void;
  onOpenLogs?: (ruleId?: string) => void;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ onExit, onOpenLogs }) => {
  const { i18n } = useTranslation();
  const { language, theme } = useAppStore();
  const activeLang = language || i18n.language;
  const isDark = theme === 'dark';

  const isZh = /zh|中文|简|繁/i.test(activeLang || '');
  const L = (zh: string, en: string) => (isZh ? zh : en);

  const [documents, setDocuments] = useState<any[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [chunks, setChunks] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[]; categories: any[] }>({ nodes: [], links: [], categories: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  // Graph RAG Interactive Controls
  const [zoomSensitivity, setZoomSensitivity] = useState<number>(1.0);
  const [forceRepulsion, setForceRepulsion] = useState<number>(600);
  const [showLinkLabels, setShowLinkLabels] = useState<boolean>(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const echartsRef = useRef<any>(null);

  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingExps, setLoadingExps] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleZoomIn = () => {
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      inst.dispatchAction({ type: 'graphRoam', zoom: 1.25 * zoomSensitivity });
    }
  };

  const handleZoomOut = () => {
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      inst.dispatchAction({ type: 'graphRoam', zoom: (1 / 1.25) / zoomSensitivity });
    }
  };

  const handleResetZoom = () => {
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      inst.dispatchAction({ type: 'restore' });
    }
  };

  const handleChartClick = (params: any) => {
    if (params.dataType === 'node') {
      setSelectedNode(params.data);
      if (echartsRef.current) {
        const inst = echartsRef.current.getEchartsInstance();
        inst.dispatchAction({
          type: 'highlight',
          seriesIndex: 0,
          dataIndex: params.dataIndex
        });
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedNode(null);
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      inst.dispatchAction({
        type: 'downplay',
        seriesIndex: 0
      });
    }
  };

  const fetchDocuments = async (showLoading = true) => {
    if (showLoading) setLoadingDocs(true);
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/documents`);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
      if (showLoading) message.error(L("无法加载文档列表", "Failed to load documents"));
    }
    if (showLoading) setLoadingDocs(false);
  };

  const fetchExperiences = async () => {
    setLoadingExps(true);
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/experiences`);
      const data = await res.json();
      setExperiences(data);
    } catch (e) {
      console.error(e);
      message.error(L("无法加载经验列表", "Failed to load experiences"));
    }
    setLoadingExps(false);
  };

  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/kb_rules`);
      const data = await res.json();
      setRules(data);
    } catch (e) {
      console.error(e);
      message.error(L("无法加载规则列表", "Failed to load rules"));
    }
    setLoadingRules(false);
  };

  const fetchChunks = async (retryCount = 0) => {
    setLoadingChunks(true);
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/chunks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChunks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchChunks error:", e);
      if (retryCount < 1) {
        setTimeout(() => fetchChunks(retryCount + 1), 1200);
      }
    } finally {
      setLoadingChunks(false);
    }
  };

  const fetchGraph = async (retryCount = 0) => {
    setLoadingGraph(true);
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/graph`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data.nodes)) {
        setGraphData(data);
      }
    } catch (e) {
      console.error("fetchGraph error:", e);
      if (retryCount < 1) {
        setTimeout(() => fetchGraph(retryCount + 1), 1200);
      }
    } finally {
      setLoadingGraph(false);
    }
  };

  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      });
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error(e);
      message.error(L("语义向量检索失败", "Vector search failed"));
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchExperiences();
    fetchRules();
    fetchChunks();
    fetchGraph();
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing');
    let interval: NodeJS.Timeout;
    if (hasProcessing) {
      interval = setInterval(() => {
        fetchDocuments(false);
        fetchChunks();
        fetchGraph();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [documents]);

  const deleteDocument = async (docId: string) => {
    try {
      await fetch(`${getApiUrl()}/knowledge/documents/${docId}`, { method: 'DELETE' });
      message.success(L("文档删除成功", "Document deleted"));
      fetchDocuments();
      fetchChunks();
      fetchGraph();
    } catch (e) {
      message.error(L("删除失败", "Delete failed"));
    }
  };

  const approveExperience = async (expId: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`${getApiUrl()}/knowledge/experiences/${expId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      message.success(action === 'approve' ? L("经验已入库", "Approved") : L("已拒绝", "Rejected"));
      fetchExperiences();
      fetchChunks();
      fetchGraph();
    } catch (e) {
      message.error(L("操作失败", "Operation failed"));
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await fetch(`${getApiUrl()}/admin/kb_rules/${ruleId}`, { method: 'DELETE' });
      message.success(L("规则已删除", "Rule deleted"));
      fetchRules();
    } catch (e) {
      message.error(L("删除失败", "Delete failed"));
    }
  };

  const handleSaveRule = async (values: any) => {
    try {
      if (editingRule) {
        await fetch(`${getApiUrl()}/admin/kb_rules/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        });
        message.success(L("规则已更新", "Rule updated"));
      } else {
        await fetch(`${getApiUrl()}/admin/kb_rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        });
        message.success(L("规则已创建", "Rule created"));
      }
      setIsRuleModalOpen(false);
      fetchRules();
    } catch (e) {
      message.error(L("保存失败", "Save failed"));
    }
  };

  const openRuleModal = (rule?: any) => {
    setEditingRule(rule || null);
    form.setFieldsValue(rule || { is_active: true });
    setIsRuleModalOpen(true);
  };

  const docColumns = [
    { title: L('文件名', 'Filename'), dataIndex: 'filename', key: 'filename' },
    { title: L('类型', 'Type'), dataIndex: 'file_type', key: 'file_type', render: (t: string) => <Tag color="blue">{t?.split('/').pop() || 'unknown'}</Tag> },
    { title: L('大小 (KB)', 'Size (KB)'), dataIndex: 'file_size', key: 'file_size', render: (s: number) => (s / 1024).toFixed(1) },
    { title: L('向量块', 'Chunks'), dataIndex: 'chunk_count', key: 'chunk_count' },
    { title: L('状态', 'Status'), dataIndex: 'status', key: 'status', render: (s: string, r: any) => {
      if (s === 'completed') return <Tag color="success">{L('已入库', 'Indexed')}</Tag>;
      if (s === 'processing') {
        const est = r.file_size ? Math.ceil(r.file_size / (1024 * 1024) * 3) + 2 : 5;
        return <Tag color="processing" icon={<RefreshCw className="animate-spin" size={12}/>}>{L(`处理中 (预估 ${est}s)`, `Processing (~${est}s)`)}</Tag>;
      }
      return <Tag color="error">{L('失败', 'Failed')}</Tag>;
    }},
    { title: L('上传时间', 'Uploaded At'), dataIndex: 'created_at', key: 'created_at', render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    { title: L('操作', 'Actions'), key: 'action', render: (_: any, r: any) => (
      <div className="flex gap-2 items-center">
        <Button 
          type="text" 
          icon={<Eye size={16} />} 
          className={isDark ? "text-[var(--accent-blue)]" : "text-cyan-600"}
          onClick={() => setPreviewUrl(`${getBaseUrl()}/uploads/${r.doc_id}_${r.filename}`)} 
          title={L('预览文件', 'Preview')}
        />
        <Popconfirm title={L('确定删除该文档及所有向量?', 'Delete document & vectors?')} onConfirm={() => deleteDocument(r.doc_id)}>
          <Button danger type="text" icon={<Trash2 size={16} />} title={L('删除文件', 'Delete')} />
        </Popconfirm>
      </div>
    )}
  ];

  const expColumns = [
    { title: L('原对话上下文', 'Original Context'), dataIndex: 'content', key: 'content', render: (t: string) => <div className={`max-w-xs truncate text-xs ${isDark ? 'text-gray-300' : 'text-slate-600'}`} title={t}>{t}</div> },
    { title: L('提炼规则', 'Extracted Rule'), dataIndex: 'extracted_rule', key: 'extracted_rule', render: (t: string) => <div className={`whitespace-pre-wrap text-sm ${isDark ? 'text-cyan-300 font-medium' : 'text-cyan-800 font-semibold'}`}>{t}</div> },
    { title: L('状态', 'Status'), dataIndex: 'status', key: 'status', render: (s: string) => (
      s === 'pending' ? <Tag color="warning">{L('待审核', 'Pending')}</Tag> :
      s === 'approved' ? <Tag color="success">{L('已入库', 'Approved')}</Tag> :
      s === 'auto_approved' ? <Tag color="purple">{L('AI 自动入库', 'Auto Approved')}</Tag> :
      s === 'auto_rejected' ? <Tag color="orange">{L('AI 自动拒绝', 'Auto Rejected')}</Tag> :
      <Tag color="error">{L('已拒绝', 'Rejected')}</Tag>
    )},
    { title: L('操作', 'Actions'), key: 'action', render: (_: any, r: any) => r.status === 'pending' ? (
      <div className="flex gap-2">
        <Button size="small" type="primary" className="bg-green-500" icon={<CheckCircle size={14}/>} onClick={() => approveExperience(r.id, 'approve')}>{L('通过', 'Approve')}</Button>
        <Button size="small" danger icon={<XCircle size={14}/>} onClick={() => approveExperience(r.id, 'reject')}>{L('拒绝', 'Reject')}</Button>
      </div>
    ) : null}
  ];

  const chunkColumns = [
    { title: 'Chunk ID', dataIndex: 'id', key: 'id', render: (t: string) => <span className={`font-mono text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-700 font-bold'}`}>{t}</span> },
    { title: L('来源文件/类型', 'Source File / Type'), dataIndex: 'filename', key: 'filename', render: (t: string) => <Tag color="geekblue">{t}</Tag> },
    { title: L('文本切片内容', 'Chunk Text Content'), dataIndex: 'text', key: 'text', render: (t: string) => <div className={`max-w-md text-xs whitespace-pre-wrap line-clamp-3 ${isDark ? 'text-slate-200' : 'text-slate-900 font-normal'}`}>{t}</div> },
    { title: L('向量维度', 'Vector Dim'), dataIndex: 'embedding_dim', key: 'embedding_dim', render: (d: number) => <Tag color="purple">{d ? `${d}-D` : '384-D'}</Tag> },
    { title: L('向量 Sample (Float32)', 'Vector Sample (Float32)'), dataIndex: 'embedding_preview', key: 'embedding_preview', render: (arr: number[]) => (
      <div className={`font-mono text-[10px] max-w-xs truncate ${isDark ? 'text-emerald-400' : 'text-emerald-700 font-semibold'}`} title={JSON.stringify(arr)}>
        [{Array.isArray(arr) ? arr.join(', ') : ''}...]
      </div>
    )}
  ];

  const formattedLinks = useMemo(() => {
    return (graphData.links || []).map(link => ({
      ...link,
      label: {
        show: showLinkLabels,
        formatter: link.relation,
        fontSize: 10,
        color: isDark ? '#e2e8f0' : '#334155',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(241, 245, 249, 0.95)',
        padding: [2, 5],
        borderRadius: 4,
        borderColor: isDark ? 'rgba(34, 211, 238, 0.3)' : 'rgba(8, 145, 178, 0.3)',
        borderWidth: 1
      }
    }));
  }, [graphData.links, showLinkLabels, isDark]);

  const graphOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            return `<b>${params.data.name}</b><br/>${L('类型', 'Category')}: ${params.data.category}`;
          }
          return `<b>${params.data.source}</b> ➔ <b>${params.data.target}</b><br/>${L('关系', 'Relation')}: ${params.data.relation}`;
        }
      },
      legend: [
        {
          data: graphData.categories ? graphData.categories.map(c => c.name) : [],
          textStyle: { color: isDark ? '#cbd5e1' : '#334155', fontWeight: '500' },
          top: 10
        }
      ],
      animationDurationUpdate: 1200,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          type: 'graph',
          layout: 'force',
          data: graphData.nodes,
          links: formattedLinks,
          categories: graphData.categories,
          roam: true,
          scaleLimit: { min: 0.2, max: 4.5 },
          selectedMode: 'single',
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            color: isDark ? '#ffffff' : '#0f172a',
            fontWeight: 'bold',
            fontSize: 11,
            textBorderColor: isDark ? '#090d16' : '#ffffff',
            textBorderWidth: 2.5
          },
          lineStyle: {
            color: isDark ? 'rgba(34, 211, 238, 0.45)' : 'rgba(8, 145, 178, 0.45)',
            curveness: 0.15,
            width: 2
          },
          emphasis: {
            focus: 'adjacency',
            scale: 1.25,
            lineStyle: {
              width: 4,
              color: isDark ? '#38bdf8' : '#0284c7',
              shadowBlur: 12,
              shadowColor: isDark ? 'rgba(56, 189, 248, 0.8)' : 'rgba(2, 132, 199, 0.6)'
            },
            itemStyle: {
              borderWidth: 4,
              borderColor: isDark ? '#38bdf8' : '#0284c7',
              shadowBlur: 16,
              shadowColor: isDark ? 'rgba(56, 189, 248, 0.9)' : 'rgba(2, 132, 199, 0.7)'
            },
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
              color: isDark ? '#38bdf8' : '#0284c7',
              textBorderColor: isDark ? '#000000' : '#ffffff',
              textBorderWidth: 3
            }
          },
          blur: {
            itemStyle: {
              opacity: 0.15
            },
            lineStyle: {
              opacity: 0.08
            },
            label: {
              show: false
            }
          },
          force: {
            repulsion: forceRepulsion,
            edgeLength: 140
          }
        }
      ]
    };
  }, [graphData, formattedLinks, forceRepulsion, isDark, L]);

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    action: `${getApiUrl()}/knowledge/upload`,
    showUploadList: true,
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(L(`${info.file.name} 上传并处理完成.`, `${info.file.name} uploaded successfully.`));
        fetchDocuments();
        fetchChunks();
        fetchGraph();
      } else if (status === 'error') {
        message.error(L(`${info.file.name} 上传失败.`, `${info.file.name} upload failed.`));
      }
    },
  };

  const getPaginationConfig = (pageSize = 8) => ({
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: ['5', '8', '15', '30', '50'],
    showTotal: (total: number) => L(`共 ${total} 条`, `Total ${total} items`),
    position: ['bottomRight'] as ('bottomRight')[],
    showQuickJumper: true
  });

  const panelBgClass = isDark
    ? "bg-[#1a1b26]/95 border-[var(--border-color)] text-white shadow-2xl"
    : "bg-white/95 border-slate-200 text-slate-900 shadow-2xl";

  const headerBgClass = isDark ? "bg-black/30 border-b border-white/10" : "bg-slate-100/90 border-b border-slate-200";

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`absolute inset-4 z-50 flex flex-col rounded-2xl overflow-hidden backdrop-blur-xl border ${panelBgClass}`}
    >
      <div className={`flex justify-between items-center px-6 py-4 ${headerBgClass}`}>
        <div className="flex items-center gap-3">
          <Brain className={isDark ? "text-[var(--accent-purple)] w-6 h-6" : "text-purple-600 w-6 h-6"} />
          <h2 className={`text-xl font-bold m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {L('知识库管理 (Agentic Graph RAG)', 'Knowledge Base Management (Agentic Graph RAG)')}
          </h2>
        </div>
        <button onClick={onExit} className={`p-2 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}>
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <Tabs 
          defaultActiveKey="1" 
          items={[
            {
              key: '1',
              label: <span className="flex items-center gap-2"><FileText size={16}/> {L('文档库', 'Documents')}</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <Upload.Dragger {...uploadProps} className={isDark ? "bg-black/20 border-gray-600" : "bg-slate-50 border-slate-300"}>
                    <p className="ant-upload-drag-icon flex justify-center"><UploadCloud className={isDark ? "text-[var(--accent-blue)]" : "text-cyan-600"} size={48}/></p>
                    <p className={`ant-upload-text font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
                      {L('点击或拖拽文件到此处上传至知识库', 'Click or drag files here to upload to Knowledge Base')}
                    </p>
                    <p className={`ant-upload-hint text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                      {L('支持 PDF, DOCX, Excel 以及常见日志格式。后台会自动拆分并向量化。', 'Supports PDF, DOCX, Excel, and log files. Automatically split and vectorized.')}
                    </p>
                  </Upload.Dragger>
                  
                  <div className="flex justify-between items-center">
                    <h3 className={`text-lg font-medium m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{L('已入库文档', 'Indexed Documents')}</h3>
                    <Button icon={<RefreshCw size={14}/>} onClick={fetchDocuments}>{L('刷新', 'Refresh')}</Button>
                  </div>
                  
                  <Table 
                    dataSource={documents} 
                    columns={docColumns} 
                    rowKey="doc_id"
                    loading={loadingDocs}
                    pagination={getPaginationConfig(8)}
                    className={isDark ? "custom-dark-table" : "custom-light-table"}
                  />
                </div>
              )
            },
            {
              key: '2',
              label: <span className="flex items-center gap-2"><Layers size={16}/> {L('向量与切片明细', 'Chunks & Vectors')}</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center flex-wrap gap-4">
                    <div className="flex items-center gap-2 flex-1 max-w-xl">
                      <Input 
                        placeholder={L("检索文本切片或尝试语义向量匹配 (如: AMR 调度故障)...", "Search chunks or try vector matching (e.g. AMR fault)...")} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onPressEnter={handleVectorSearch}
                        prefix={<Search size={16} className={isDark ? "text-slate-400" : "text-slate-500"}/>}
                        className={isDark ? "bg-black/40 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}
                      />
                      <Button type="primary" onClick={handleVectorSearch}>{L('向量检索', 'Search')}</Button>
                      {searchResults && (
                        <Button onClick={() => { setSearchQuery(''); setSearchResults(null); }}>{L('重置', 'Reset')}</Button>
                      )}
                    </div>
                    <Button icon={<RefreshCw size={14}/>} onClick={fetchChunks}>{L('刷新切片列表', 'Refresh Chunks')}</Button>
                  </div>

                  <Table 
                    dataSource={searchResults || chunks} 
                    columns={searchResults ? [
                      { title: 'Chunk ID', dataIndex: 'id', key: 'id', render: (t: string) => <span className={`font-mono text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-700 font-bold'}`}>{t}</span> },
                      { title: L('来源', 'Source'), dataIndex: 'filename', key: 'filename', render: (t: string) => <Tag color="geekblue">{t}</Tag> },
                      { title: L('匹配切片文本', 'Matched Chunk Text'), dataIndex: 'text', key: 'text', render: (t: string) => <div className={`max-w-md text-xs whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-900 font-normal'}`}>{t}</div> },
                      { title: L('余弦相似度', 'Similarity'), dataIndex: 'similarity', key: 'similarity', render: (s: number) => <Tag color="green">{s}%</Tag> },
                      { title: L('向量距离', 'Distance'), dataIndex: 'distance', key: 'distance', render: (d: number) => <Tag color="purple">{d}</Tag> },
                    ] : chunkColumns} 
                    rowKey="id"
                    loading={loadingChunks}
                    pagination={getPaginationConfig(8)}
                    className={isDark ? "custom-dark-table" : "custom-light-table"}
                  />
                </div>
              )
            },
            {
              key: '3',
              label: <span className="flex items-center gap-2"><Share2 size={16}/> {L('知识关联图谱 (Graph RAG)', 'Knowledge Graph RAG')}</span>,
              children: (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center flex-wrap gap-4">
                    <div>
                      <h3 className={`text-lg font-medium m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{L('实体与知识拓扑关联图', 'Entity-Relationship Graph')}</h3>
                      <p className={`text-xs m-0 mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {L('自动构建 设备 (Device) • 故障 (Fault) • 解决方案 (Solution) • 规则文档 的实体关系链', 'Builds entity relationships for Devices, Faults, Solutions, and Rules')}
                      </p>
                    </div>
                    
                    {/* Graph Controls Toolbar */}
                    <div className={`flex items-center gap-3 p-2 rounded-xl border flex-wrap ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                      <div className="flex items-center gap-1">
                        <Button size="small" icon={<ZoomIn size={14}/>} onClick={handleZoomIn} title={L("放大", "Zoom In")}/>
                        <Button size="small" icon={<ZoomOut size={14}/>} onClick={handleZoomOut} title={L("缩小", "Zoom Out")}/>
                        <Button size="small" icon={<Maximize2 size={14}/>} onClick={handleResetZoom} title={L("重置视角", "Reset View")}/>
                      </div>

                      <div className="flex items-center gap-2 border-l pl-3 border-slate-700">
                        <span className="text-xs text-slate-400 font-medium">{L('缩放灵敏度', 'Zoom Sensitivity')}:</span>
                        <Select 
                          size="small" 
                          value={zoomSensitivity} 
                          onChange={setZoomSensitivity} 
                          options={[
                            { value: 0.3, label: L('低 (0.3x)', 'Low (0.3x)') },
                            { value: 0.8, label: L('标准 (0.8x)', 'Normal (0.8x)') },
                            { value: 1.5, label: L('高 (1.5x)', 'High (1.5x)') },
                            { value: 2.0, label: L('极高 (2.0x)', 'Max (2.0x)') }
                          ]}
                          className="w-28"
                        />
                      </div>

                      <div className="flex items-center gap-2 border-l pl-3 border-slate-700">
                        <span className="text-xs text-slate-400 font-medium">{L('节点斥力间距', 'Node Spacing')}:</span>
                        <div className="w-24 px-1">
                          <Slider 
                            min={300} 
                            max={1500} 
                            step={100} 
                            value={forceRepulsion} 
                            onChange={(v) => setForceRepulsion(v)} 
                            tooltip={{ formatter: (val) => `${val}` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1 border-l pl-3 border-slate-700">
                        <span className="text-xs text-slate-400 font-medium">{L('边关系', 'Link Labels')}:</span>
                        <Switch size="small" checked={showLinkLabels} onChange={setShowLinkLabels} />
                      </div>

                      <Button icon={<RefreshCw size={14}/>} size="small" onClick={fetchGraph}>{L('刷新图谱', 'Refresh')}</Button>
                    </div>
                  </div>

                  <div className={`w-full h-[550px] rounded-xl border p-2 relative overflow-hidden ${isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-300 bg-slate-50'}`}>
                    {loadingGraph ? (
                      <div className="w-full h-full flex items-center justify-center text-cyan-600 font-mono">{L('加载知识图谱中...', 'Loading Knowledge Graph...')}</div>
                    ) : (
                      <>
                        <ReactECharts 
                          ref={echartsRef}
                          option={graphOption}
                          style={{ height: '100%', width: '100%' }}
                          opts={{ renderer: 'canvas' }}
                          onEvents={{
                            click: handleChartClick
                          }}
                        />

                        {selectedNode && (
                          <motion.div 
                            initial={{ opacity: 0, y: 15, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 15, scale: 0.9 }}
                            className={`absolute bottom-4 left-4 z-20 flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md ${isDark ? 'bg-slate-900/95 border-cyan-500/60 text-white' : 'bg-white/95 border-cyan-500/60 text-slate-900'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"/>
                              <span className="text-xs font-semibold text-cyan-400">{L('高亮关联节点', 'Focused Node')}:</span>
                              <span className="text-sm font-bold">{selectedNode.name}</span>
                              <Tag color="cyan" className="ml-1">{selectedNode.category}</Tag>
                            </div>
                            <Button 
                              size="small" 
                              type="dashed" 
                              onClick={handleClearSelection}
                              className="text-xs"
                            >
                              {L('重置高亮', 'Clear Focus')}
                            </Button>
                          </motion.div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            },
            {
              key: '4',
              label: <span className="flex items-center gap-2"><Brain size={16}/> {L('经验沉淀审核', 'Experience Review')}</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h3 className={`text-lg font-medium m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{L('待审核的高价值经验', 'Pending Experience Queue')}</h3>
                    <Button icon={<RefreshCw size={14}/>} onClick={fetchExperiences}>{L('刷新', 'Refresh')}</Button>
                  </div>
                  
                  <Table 
                    dataSource={experiences} 
                    columns={expColumns} 
                    rowKey="id"
                    loading={loadingExps}
                    pagination={getPaginationConfig(8)}
                    className={isDark ? "custom-dark-table" : "custom-light-table"}
                  />
                </div>
              )
            },
            {
              key: '5',
              label: <span className="flex items-center gap-2"><Settings size={16}/> {L('自动审核规则', 'Auto-Review Rules')}</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h3 className={`text-lg font-medium m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{L('AI 自动审核规则', 'AI Auto-Review Rules')}</h3>
                    <div className="flex gap-2">
                      <Button icon={<RefreshCw size={14}/>} onClick={fetchRules}>{L('刷新', 'Refresh')}</Button>
                      <Button type="primary" onClick={() => openRuleModal()}>{L('新建规则', 'Create Rule')}</Button>
                    </div>
                  </div>
                  
                  <Table 
                    dataSource={rules} 
                    rowKey="id"
                    loading={loadingRules}
                    pagination={getPaginationConfig(8)}
                    className={isDark ? "custom-dark-table" : "custom-light-table"}
                    columns={[
                      { title: L('规则名称', 'Rule Name'), dataIndex: 'rule_name', key: 'rule_name' },
                      { title: L('审核提示词 (Prompt)', 'Audit Prompt'), dataIndex: 'prompt', key: 'prompt', render: (t: string) => <div className={`max-w-md truncate text-xs ${isDark ? 'text-gray-400' : 'text-slate-500'}`} title={t}>{t}</div> },
                      { title: L('状态', 'Status'), dataIndex: 'is_active', key: 'is_active', render: (s: boolean) => s ? <Tag color="success">{L('已启用', 'Active')}</Tag> : <Tag color="default">{L('已禁用', 'Disabled')}</Tag> },
                      { title: L('最近自动执行', 'Last Executed'), dataIndex: 'last_executed_at', key: 'last_executed_at', render: (t: string) => t ? dayjs(t).format('MM-DD HH:mm:ss') : <span className="text-gray-500">{L('从未执行', 'Never')}</span> },
                      { title: L('创建时间', 'Created At'), dataIndex: 'created_at', key: 'created_at', render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
                      { title: L('操作', 'Actions'), key: 'action', render: (_: any, r: any) => (
                        <div className="flex gap-2">
                          {onOpenLogs && (
                            <Button type="link" size="small" icon={<Activity size={14}/>} onClick={() => onOpenLogs(r.id)} className="text-emerald-500 px-0">
                              {L('日志', 'Logs')}
                            </Button>
                          )}
                          <Button type="text" icon={<Edit size={16} />} className={isDark ? "text-[var(--accent-blue)]" : "text-cyan-600"} onClick={() => openRuleModal(r)} />
                          <Popconfirm title={L('确定删除该规则?', 'Delete this rule?')} onConfirm={() => deleteRule(r.id)}>
                            <Button danger type="text" icon={<Trash2 size={16} />} />
                          </Popconfirm>
                        </div>
                      )}
                    ]}
                  />
                </div>
              )
            }
          ]}
        />
      </div>

      <Modal 
        title="文档预览" 
        open={!!previewUrl} 
        onCancel={() => setPreviewUrl(null)}
        footer={null}
        width={900}
        styles={{ body: { height: '75vh', padding: 0 } }}
        className="custom-dark-modal"
      >
        {previewUrl && (
          <iframe 
            src={previewUrl} 
            className="w-full h-full border-0 bg-white" 
            title="Document Preview"
          />
        )}
      </Modal>

      <Modal
        title={editingRule ? "编辑规则" : "新建规则"}
        open={isRuleModalOpen}
        onCancel={() => setIsRuleModalOpen(false)}
        footer={null}
        className="custom-dark-modal"
      >
        <Form form={form} layout="vertical" onFinish={handleSaveRule} className="mt-4">
          <Form.Item name="rule_name" label="规则名称" rules={[{ required: true }]}>
            <Input className="bg-black/30 border-gray-600 text-white" placeholder="如：只通过包含故障原因的经验" />
          </Form.Item>
          <Form.Item name="prompt" label="审核提示词 (Prompt)" rules={[{ required: true }]}>
            <Input.TextArea className="bg-black/30 border-gray-600 text-white" rows={4} placeholder="详细描述 AI 审核的标准..." />
          </Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item className="mb-0 text-right">
            <Button onClick={() => setIsRuleModalOpen(false)} className="mr-2">取消</Button>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default KnowledgePanel;
