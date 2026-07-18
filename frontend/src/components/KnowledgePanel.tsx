import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud, FileText, Trash2, CheckCircle, XCircle, Brain, RefreshCw, Eye } from 'lucide-react';
import { Tabs, Table, Button, Upload, message, Popconfirm, Tag, Modal } from 'antd';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import { getApiUrl, getBaseUrl } from '../config';

interface KnowledgePanelProps {
  onExit: () => void;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ onExit }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingExps, setLoadingExps] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchDocuments = async (showLoading = true) => {
    if (showLoading) setLoadingDocs(true);
    try {
      const res = await fetch(`${getApiUrl()}/knowledge/documents`);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
      if (showLoading) message.error("无法加载文档列表");
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
      message.error("无法加载经验列表");
    }
    setLoadingExps(false);
  };

  useEffect(() => {
    fetchDocuments();
    fetchExperiences();
  }, []);

  // Poll for status updates if any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing');
    let interval: NodeJS.Timeout;
    if (hasProcessing) {
      interval = setInterval(() => {
        fetchDocuments(false);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [documents]);

  const deleteDocument = async (docId: string) => {
    try {
      await fetch(`${getApiUrl()}/knowledge/documents/${docId}`, { method: 'DELETE' });
      message.success("文档删除成功");
      fetchDocuments();
    } catch (e) {
      message.error("删除失败");
    }
  };

  const approveExperience = async (expId: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`${getApiUrl()}/knowledge/experiences/${expId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      message.success(action === 'approve' ? "经验已入库" : "已拒绝");
      fetchExperiences();
    } catch (e) {
      message.error("操作失败");
    }
  };

  const docColumns = [
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    { title: '类型', dataIndex: 'file_type', key: 'file_type', render: (t: string) => <Tag color="blue">{t?.split('/').pop() || 'unknown'}</Tag> },
    { title: '大小 (KB)', dataIndex: 'file_size', key: 'file_size', render: (s: number) => (s / 1024).toFixed(1) },
    { title: '向量块', dataIndex: 'chunk_count', key: 'chunk_count' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string, r: any) => {
      if (s === 'completed') return <Tag color="success">已入库</Tag>;
      if (s === 'processing') {
        const est = r.file_size ? Math.ceil(r.file_size / (1024 * 1024) * 3) + 2 : 5;
        return <Tag color="processing" icon={<RefreshCw className="animate-spin" size={12}/>}>处理中 (预估 {est}s)</Tag>;
      }
      return <Tag color="error">失败</Tag>;
    }},
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at', render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    { title: '操作', key: 'action', render: (_: any, r: any) => (
      <div className="flex gap-2 items-center">
        <Button 
          type="text" 
          icon={<Eye size={16} />} 
          className="text-[var(--accent-blue)]"
          onClick={() => setPreviewUrl(`${getBaseUrl()}/uploads/${r.doc_id}_${r.filename}`)} 
          title="预览文件"
        />
        <Popconfirm title="确定删除该文档及所有向量?" onConfirm={() => deleteDocument(r.doc_id)}>
          <Button danger type="text" icon={<Trash2 size={16} />} title="删除文件" />
        </Popconfirm>
      </div>
    )}
  ];

  const expColumns = [
    { title: '原对话上下文', dataIndex: 'content', key: 'content', render: (t: string) => <div className="max-w-xs truncate text-xs text-gray-400" title={t}>{t}</div> },
    { title: '提炼规则', dataIndex: 'extracted_rule', key: 'extracted_rule', render: (t: string) => <div className="whitespace-pre-wrap text-sm text-cyan-300">{t}</div> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => (
      s === 'pending' ? <Tag color="warning">待审核</Tag> :
      s === 'approved' ? <Tag color="success">已入库</Tag> :
      <Tag color="error">已拒绝</Tag>
    )},
    { title: '操作', key: 'action', render: (_: any, r: any) => r.status === 'pending' ? (
      <div className="flex gap-2">
        <Button size="small" type="primary" className="bg-green-500" icon={<CheckCircle size={14}/>} onClick={() => approveExperience(r.id, 'approve')}>通过</Button>
        <Button size="small" danger icon={<XCircle size={14}/>} onClick={() => approveExperience(r.id, 'reject')}>拒绝</Button>
      </div>
    ) : null}
  ];

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    action: `${getApiUrl()}/knowledge/upload`,
    showUploadList: true,
    itemRender: (originNode, file, fileList, actions) => {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mt-4 p-4 rounded-xl bg-black/40 border border-gray-700/50 flex flex-col gap-3 shadow-lg"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--accent-cyan)]/10">
                <FileText className="text-[var(--accent-cyan)]" size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-medium text-sm">{file.name}</span>
                <span className="text-gray-500 text-xs">{(file.size ? (file.size / 1024 / 1024).toFixed(2) : 0)} MB</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {file.status === 'uploading' && (
                <span className="text-[var(--accent-cyan)] font-mono font-medium">{file.percent?.toFixed(1)}%</span>
              )}
              {file.status === 'done' && <CheckCircle className="text-green-500" size={20} />}
              {file.status === 'error' && <XCircle className="text-red-500" size={20} />}
            </div>
          </div>
          
          {file.status === 'uploading' && (
            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-[var(--accent-blue)] via-[var(--accent-cyan)] to-[var(--accent-purple)] relative"
                initial={{ width: 0 }}
                animate={{ width: `${file.percent || 0}%` }}
                transition={{ type: 'tween', ease: 'linear', duration: 0.2 }}
              >
                {/* 扫描光效 */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full h-full"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                />
              </motion.div>
            </div>
          )}
          {file.status === 'uploading' && (
             <p className="text-xs text-[var(--accent-cyan)] m-0 animate-pulse text-right">正在上传并进行向量化处理...</p>
          )}
        </motion.div>
      );
    },
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(`${info.file.name} 上传并处理完成.`);
        fetchDocuments();
      } else if (status === 'error') {
        message.error(`${info.file.name} 上传失败.`);
      }
    },
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-4 z-50 flex flex-col glass-panel rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-color)] bg-[#1a1b26]/90 backdrop-blur-xl"
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-color)] bg-black/20">
        <div className="flex items-center gap-3">
          <Brain className="text-[var(--accent-purple)] w-6 h-6" />
          <h2 className="text-xl font-bold text-white m-0">知识库管理 (Agentic RAG)</h2>
        </div>
        <button onClick={onExit} className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <Tabs 
          defaultActiveKey="1" 
          items={[
            {
              key: '1',
              label: <span className="flex items-center gap-2"><FileText size={16}/> 文档库</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <Upload.Dragger {...uploadProps} className="bg-black/20 border-gray-600">
                    <p className="ant-upload-drag-icon flex justify-center"><UploadCloud className="text-[var(--accent-blue)]" size={48}/></p>
                    <p className="ant-upload-text text-gray-300 font-medium">点击或拖拽文件到此处上传至知识库</p>
                    <p className="ant-upload-hint text-gray-500">支持 PDF, DOCX, Excel 以及常见日志格式。后台会自动拆分并向量化。</p>
                  </Upload.Dragger>
                  
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg text-white font-medium m-0">已入库文档</h3>
                    <Button icon={<RefreshCw size={14}/>} onClick={fetchDocuments}>刷新</Button>
                  </div>
                  
                  <Table 
                    dataSource={documents} 
                    columns={docColumns} 
                    rowKey="doc_id"
                    loading={loadingDocs}
                    pagination={{ pageSize: 8 }}
                    className="custom-dark-table"
                  />
                </div>
              )
            },
            {
              key: '2',
              label: <span className="flex items-center gap-2"><Brain size={16}/> 经验沉淀审核 (A+B)</span>,
              children: (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg text-white font-medium m-0">待审核的高价值经验</h3>
                    <Button icon={<RefreshCw size={14}/>} onClick={fetchExperiences}>刷新</Button>
                  </div>
                  
                  <Table 
                    dataSource={experiences} 
                    columns={expColumns} 
                    rowKey="id"
                    loading={loadingExps}
                    pagination={{ pageSize: 8 }}
                    className="custom-dark-table"
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
    </motion.div>
  );
};

export default KnowledgePanel;
