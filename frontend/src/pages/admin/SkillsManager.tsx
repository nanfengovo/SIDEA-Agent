import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, Tabs } from 'antd';
import { Plus, Edit, Trash2, Cpu } from 'lucide-react';
import { getApiUrl } from '../../config';
import PromptEditor from './PromptEditor';

interface SkillItem {
  skill_id: string;
  skill_name: string;
  description: string;
  template_path: string;
  bound_tools: string[];
  temperature: number;
  is_enabled: number;
  sort_order: number;
}

export default function SkillsManager() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tools, setTools] = useState<{name: string, key: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [form] = Form.useForm();

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/skills`);
      const data = await res.json();
      setSkills(data);
    } catch (e) {
      console.error(e);
      message.error("Failed to load skills");
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/tools`);
      const data = await res.json();
      setTools(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSkills();
    fetchTools();
  }, []);

  const handleSave = async (values: any) => {
    try {
      const payload = {
        ...values,
        is_enabled: values.is_enabled ? 1 : 0
      };
      
      const method = editingSkill ? 'PUT' : 'POST';
      const url = editingSkill ? `${getApiUrl()}/skills/${editingSkill.skill_id}` : `${getApiUrl()}/skills`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        message.success('Skill saved!');
        setIsModalOpen(false);
        fetchSkills();
      } else {
        message.error('Failed to save');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete skill ${id}?`)) return;
    try {
      const res = await fetch(`${getApiUrl()}/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        message.success('Deleted');
        fetchSkills();
      }
    } catch (e) {
      console.error(e);
      message.error('Delete failed');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'skill_id', key: 'skill_id' },
    { title: 'Name', dataIndex: 'skill_name', key: 'skill_name' },
    { title: 'Template Path', dataIndex: 'template_path', key: 'template_path' },
    { title: 'Status', dataIndex: 'is_enabled', key: 'is_enabled', render: (val: number) => val ? 'Enabled' : 'Disabled' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: SkillItem) => (
        <div className="flex gap-2">
          <Button type="text" icon={<Edit size={16} />} onClick={() => {
            setEditingSkill(record);
            form.setFieldsValue({ ...record, is_enabled: !!record.is_enabled });
            setIsModalOpen(true);
          }} />
          <Button type="text" danger icon={<Trash2 size={16} />} onClick={() => handleDelete(record.skill_id)} />
        </div>
      )
    }
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
          <Cpu className="text-[var(--accent-purple)]" /> 技能与提示词 (Skills & Prompts)
        </h2>
        <Button type="primary" icon={<Plus size={16} />} onClick={() => {
          setEditingSkill(null);
          form.resetFields();
          form.setFieldsValue({ is_enabled: true, temperature: 0.1, sort_order: 0, bound_tools: [] });
          setIsModalOpen(true);
        }}>Add Skill</Button>
      </div>

      <Table 
        dataSource={skills} 
        columns={columns} 
        rowKey="skill_id" 
        loading={loading}
        pagination={false}
        className="glass-panel"
      />

      <Modal
        title={editingSkill ? `Edit Skill: ${editingSkill.skill_name}` : "New Skill"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={800}
      >
        <Tabs defaultActiveKey="1">
          <Tabs.TabPane tab="Configuration" key="1">
            <Form form={form} layout="vertical" onFinish={handleSave} className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Form.Item name="skill_id" label="Skill ID" rules={[{ required: true }]}>
                  <Input disabled={!!editingSkill} />
                </Form.Item>
                <Form.Item name="skill_name" label="Skill Name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </div>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="template_path" label="Template Path (.md)" rules={[{ required: true }]}>
                <Input placeholder="skills/my_skill/PROMPT.md" />
              </Form.Item>
              <Form.Item name="bound_tools" label="Bound Tools">
                <Select mode="multiple" placeholder="Select tools">
                  {tools.map(t => (
                    <Select.Option key={t.key} value={t.key}>{t.name} ({t.key})</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              
              <div className="grid grid-cols-3 gap-4">
                <Form.Item name="temperature" label="Temperature">
                  <InputNumber min={0} max={2} step={0.1} />
                </Form.Item>
                <Form.Item name="sort_order" label="Sort Order">
                  <InputNumber />
                </Form.Item>
                <Form.Item name="is_enabled" label="Enabled" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </div>
              
              <Form.Item className="mb-0 flex justify-end">
                <Button type="primary" htmlType="submit">Save Configuration</Button>
              </Form.Item>
            </Form>
          </Tabs.TabPane>
          {editingSkill && editingSkill.template_path && (
            <Tabs.TabPane tab="Prompt Editor" key="2">
              <div className="h-[500px] mt-4">
                <PromptEditor templatePath={editingSkill.template_path} />
              </div>
            </Tabs.TabPane>
          )}
        </Tabs>
      </Modal>
    </div>
  );
}
