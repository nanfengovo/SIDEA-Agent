import React, { useState, useEffect } from 'react';
import { Table, message } from 'antd';
import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../config';

interface ToolItem {
  name: string;
  description: string;
  key: string;
}

export default function ToolsViewer() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/tools`);
      const data = await res.json();
      setTools(Array.isArray(data) ? data : []);
      if (!res.ok || !Array.isArray(data)) message.error(t('tools_load_failed'));
    } catch (e) {
      console.error(e);
      message.error(t('tools_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const columns = [
    {
      title: 'Tool Key / Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ToolItem) => (
        <span className="font-mono text-[var(--accent-cyan)]">{text || record.key}</span>
      ),
    },
    { title: 'Description', dataIndex: 'description', key: 'description' },
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
          <Wrench className="text-[var(--accent-cyan)]" /> {t('tools_title')}
        </h2>
      </div>

      <div className="mb-4 text-[var(--text-secondary)]">
        <p>{t('tools_desc')}</p>
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
