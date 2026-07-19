import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, Tabs } from 'antd';
import { Plus, Edit, Trash2, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tools, setTools] = useState<{ name: string; key: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [form] = Form.useForm();

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/skills`);
      const data = await res.json();
      setSkills(Array.isArray(data) ? data : []);
      if (!res.ok || !Array.isArray(data)) message.error(t('skills_load_failed'));
    } catch (e) {
      console.error(e);
      message.error(t('skills_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/admin/tools`);
      const data = await res.json();
      setTools(Array.isArray(data) ? data : []);
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
        description: values.description || '',
        bound_tools: values.bound_tools || [],
        is_enabled: values.is_enabled ? 1 : 0,
      };

      const method = editingSkill ? 'PUT' : 'POST';
      const url = editingSkill
        ? `${getApiUrl()}/admin/skills/${editingSkill.skill_id}`
        : `${getApiUrl()}/admin/skills`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success(t('skills_saved'));
        setIsModalOpen(false);
        fetchSkills();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(`${t('skills_save_failed')}${err?.detail ? `: ${err.detail}` : ''}`);
      }
    } catch (e) {
      console.error(e);
      message.error(t('skills_save_failed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`${t('common_delete')} ${id}?`)) return;
    try {
      const res = await fetch(`${getApiUrl()}/admin/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        message.success(t('skills_deleted'));
        fetchSkills();
      } else {
        message.error(t('skills_delete_failed'));
      }
    } catch (e) {
      console.error(e);
      message.error(t('skills_delete_failed'));
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'skill_id', key: 'skill_id' },
    { title: 'Name', dataIndex: 'skill_name', key: 'skill_name' },
    { title: 'Template Path', dataIndex: 'template_path', key: 'template_path' },
    {
      title: 'Status',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      render: (val: number) => (val ? 'Enabled' : 'Disabled'),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: SkillItem) => (
        <div className="flex gap-2">
          <Button
            type="text"
            icon={<Edit size={16} />}
            onClick={() => {
              setEditingSkill(record);
              form.setFieldsValue({
                ...record,
                bound_tools: Array.isArray(record.bound_tools) ? record.bound_tools : [],
                is_enabled: !!record.is_enabled,
              });
              setIsModalOpen(true);
            }}
          />
          <Button
            type="text"
            danger
            icon={<Trash2 size={16} />}
            onClick={() => handleDelete(record.skill_id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
          <Cpu className="text-[var(--accent-purple)]" /> {t('skills_title')}
        </h2>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setEditingSkill(null);
            form.resetFields();
            form.setFieldsValue({ is_enabled: true, temperature: 0.1, sort_order: 0, bound_tools: [] });
            setIsModalOpen(true);
          }}
        >
          {t('skills_add')}
        </Button>
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
        title={editingSkill ? `${t('common_edit')}: ${editingSkill.skill_name}` : t('skills_add')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={800}
      >
        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: 'Configuration',
              children: (
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
                    <Input placeholder="skills/templates/my_skill.md" />
                  </Form.Item>
                  <Form.Item name="bound_tools" label="Bound Tools">
                    <Select mode="multiple" placeholder="Select tools">
                      {tools.map((tl) => (
                        <Select.Option key={tl.key} value={tl.key}>
                          {tl.name} ({tl.key})
                        </Select.Option>
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
                    <Button type="primary" htmlType="submit">
                      {t('common_save')}
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            ...(editingSkill && editingSkill.template_path
              ? [
                  {
                    key: '2',
                    label: 'Prompt Editor',
                    children: (
                      <div className="h-[500px] mt-4">
                        <PromptEditor templatePath={editingSkill.template_path} />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Modal>
    </div>
  );
}
