import React, { useState, useEffect } from 'react';
import { Table, message } from 'antd';
import { Wrench, CheckCircle, XCircle } from 'lucide-react';
import { getApiUrl } from '../../config';

interface ToolItem {
  name: string;
  description: string;
  key: string;
}

export default function ToolsViewer() {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/tools`);
      const data = await res.json();
      setTools(data);
    } catch (e) {
      console.error(e);
      message.error("Failed to load tools");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const columns = [
    { title: 'Tool Key / Name', dataIndex: 'name', key: 'name', render: (text: string, record: ToolItem) => <span className="font-mono text-[var(--accent-cyan)]">{text || record.key}</span> },
    { title: 'Description', dataIndex: 'description', key: 'description' }
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
          <Wrench className="text-[var(--accent-cyan)]" /> 工具总览 (Tools Hub)
        </h2>
      </div>
      
      <div className="mb-4 text-[var(--text-secondary)]">
        <p>系统已注册的 Python 核心工具列表。这些工具可被分配给不同的技能（Skills）。出于安全考虑，工具源码仅支持在服务端修改。</p>
      </div>

      <Table 
        dataSource={tools} 
        columns={columns} 
        rowKey="key" 
        loading={loading}
        pagination={{ pageSize: 20 }}
        className="glass-panel"
      />
    </div>
  );
}
