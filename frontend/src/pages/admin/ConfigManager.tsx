import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message } from 'antd';
import { Plus, Edit, Trash2, Server } from 'lucide-react';
import { getApiUrl, getBaseUrl } from '../../config';

interface ConfigItem {
  config_key: string;
  config_value: string;
  category: string;
  description: string;
}

export default function ConfigManager() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form] = Form.useForm();
  
  const [serverUrl, setServerUrl] = useState(() => getBaseUrl());

  const handleSaveServerUrl = () => {
    localStorage.setItem('SIDEA_SERVER_URL', serverUrl);
    message.success('API 服务地址已保存，即将刷新页面');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/config`);
      const data = await res.json();
      setConfigs(data);
    } catch (e) {
      console.error(e);
      message.error("Failed to load configs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSave = async (values: any) => {
    try {
      const res = await fetch(`${getApiUrl()}/config/${values.config_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: values.config_value,
          category: values.category || 'general',
          description: values.description || ''
        })
      });
      if (res.ok) {
        message.success('Configuration saved!');
        setIsModalOpen(false);
        fetchConfigs();
      } else {
        message.error('Failed to save');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to save');
    }
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete config ${key}?`)) return;
    try {
      const res = await fetch(`${getApiUrl()}/config/${key}`, { method: 'DELETE' });
      if (res.ok) {
        message.success('Deleted');
        fetchConfigs();
      }
    } catch (e) {
      console.error(e);
      message.error('Delete failed');
    }
  };

  const columns = [
    { title: 'Key', dataIndex: 'config_key', key: 'config_key' },
    { title: 'Value', dataIndex: 'config_value', key: 'config_value' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: ConfigItem) => (
        <div className="flex gap-2">
          <Button type="text" icon={<Edit size={16} />} onClick={() => {
            setEditingKey(record.config_key);
            form.setFieldsValue(record);
            setIsModalOpen(true);
          }} />
          <Button type="text" danger icon={<Trash2 size={16} />} onClick={() => handleDelete(record.config_key)} />
        </div>
      )
    }
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)]">全局设置 (Sys Config)</h2>
        <Button type="primary" icon={<Plus size={16} />} onClick={() => {
          setEditingKey(null);
          form.resetFields();
          setIsModalOpen(true);
        }}>Add Config</Button>
      </div>

      <div className="bg-black/20 p-5 rounded-xl border border-[var(--border-color)] mb-8 flex flex-col gap-3">
        <h3 className="text-lg font-medium text-[var(--accent-cyan)] flex items-center gap-2 m-0">
          <Server size={18} />
          前端直连 API 地址配置
        </h3>
        <p className="text-sm text-gray-400 m-0">
          此配置保存在浏览器本地缓存中。如果您将系统部署在另一台服务器上，请在此处填写对应的地址 (例如: http://192.168.1.100:8000)。
        </p>
        <div className="flex gap-4 items-center">
          <Input 
            value={serverUrl} 
            onChange={e => setServerUrl(e.target.value)} 
            placeholder="http://localhost:8000"
            className="max-w-md bg-black/40 border-gray-700 text-white"
          />
          <Button type="primary" onClick={handleSaveServerUrl}>保存并应用</Button>
        </div>
      </div>

      <h3 className="text-lg font-medium text-white mb-4">系统配置 (后端数据库)</h3>

      <Table 
        dataSource={configs} 
        columns={columns} 
        rowKey="config_key" 
        loading={loading}
        pagination={{ pageSize: 10 }}
        className="glass-panel"
      />

      <Modal
        title={editingKey ? "Edit Config" : "New Config"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="config_key" label="Config Key" rules={[{ required: true }]}>
            <Input disabled={!!editingKey} />
          </Form.Item>
          <Form.Item name="config_value" label="Config Value" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item className="mb-0 flex justify-end">
            <Button type="primary" htmlType="submit">Save</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
