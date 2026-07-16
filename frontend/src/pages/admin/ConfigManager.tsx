import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';

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

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config');
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
      const res = await fetch(`/api/config/${values.config_key}`, {
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
      const res = await fetch(`/api/config/${key}`, { method: 'DELETE' });
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
