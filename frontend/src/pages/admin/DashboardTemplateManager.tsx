import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Switch,
  Tag, message, Empty, Spin, Tabs, Badge, Tooltip, Popconfirm,
} from 'antd';
import {
  Plus, Edit, Trash2, Eye, RefreshCw, LayoutDashboard, Box, Layers, Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../config';
import { useAppStore } from '../../store';
import DashboardGrid, { normalizeChartPayload } from '../../components/DashboardPanel';

interface Category {
  category_id: string;
  name: string;
  description?: string;
  template_count?: number;
}

interface TemplateItem {
  template_id: string;
  category_id: string;
  category_name?: string;
  name: string;
  description?: string;
  style: string;
  scene: string;
  template_type: string;
  has_3d: boolean;
  has_dashboard_json?: boolean;
  preview_url?: string;
  tags?: string[];
  priority: number;
  is_enabled: boolean;
}

const STYLE_OPTIONS = [
  { value: 'tech-blue', label: '科技蓝' },
  { value: 'cyberpunk', label: '赛博朋克' },
  { value: 'dark-gold', label: '暗金' },
  { value: 'industrial', label: '工业风' },
  { value: 'holographic', label: '全息' },
  { value: 'green-matrix', label: '矩阵绿' },
  { value: 'red-alert', label: '告警红' },
  { value: 'minimalist', label: '极简' },
];

const SCENE_OPTIONS = [
  { value: 'rcs', label: 'RCS' },
  { value: 'warehouse', label: '仓储' },
  { value: 'factory', label: '工厂' },
  { value: 'logistics', label: '物流' },
  { value: 'cockpit', label: '驾驶舱' },
  { value: 'general', label: '通用' },
];

const styleColor: Record<string, string> = {
  'tech-blue': 'blue',
  cyberpunk: 'magenta',
  'dark-gold': 'gold',
  industrial: 'orange',
  holographic: 'cyan',
  'green-matrix': 'green',
  'red-alert': 'red',
  minimalist: 'default',
};

export default function DashboardTemplateManager() {
  const { t } = useTranslation();
  const { theme, language } = useAppStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [styleFilter, setStyleFilter] = useState<string | undefined>();
  const [only3d, setOnly3d] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, tplRes, statsRes] = await Promise.all([
        fetch(`${getApiUrl()}/admin/dashboard/categories`),
        fetch(`${getApiUrl()}/admin/dashboard/templates?include_disabled=true&limit=500`),
        fetch(`${getApiUrl()}/admin/dashboard/stats`),
      ]);
      setCategories(await catRes.json());
      const tplData = await tplRes.json();
      setTemplates(tplData.items || []);
      setStats(await statsRes.json());
    } catch (e) {
      console.error(e);
      message.error('加载大屏模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    return templates.filter((tpl) => {
      if (activeCategory !== 'all' && tpl.category_id !== activeCategory) return false;
      if (styleFilter && tpl.style !== styleFilter) return false;
      if (only3d && !tpl.has_3d) return false;
      if (keyword) {
        const q = keyword.toLowerCase();
        return (
          tpl.name.toLowerCase().includes(q) ||
          tpl.template_id.toLowerCase().includes(q) ||
          (tpl.tags || []).some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [templates, activeCategory, styleFilter, only3d, keyword]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      category_id: activeCategory === 'all' ? 'general' : activeCategory,
      style: 'tech-blue',
      scene: 'general',
      template_type: 'json_dashboard',
      priority: 50,
      is_enabled: true,
      has_3d: false,
    });
    setEditOpen(true);
  };

  const openEdit = async (tpl: TemplateItem) => {
    try {
      const res = await fetch(`${getApiUrl()}/admin/dashboard/templates/${tpl.template_id}`);
      const full = await res.json();
      setEditing(tpl);
      form.setFieldsValue({
        ...full,
        tags: (full.tags || []).join(', '),
        dashboard_json_text: full.dashboard_json
          ? JSON.stringify(full.dashboard_json, null, 2)
          : '',
      });
      setEditOpen(true);
    } catch {
      message.error('加载模板详情失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        tags: values.tags ? String(values.tags).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
        has_3d: !!values.has_3d,
        is_enabled: !!values.is_enabled,
      };
      if (values.dashboard_json_text) {
        try {
          payload.dashboard_json = JSON.parse(values.dashboard_json_text);
        } catch {
          message.error('dashboard_json 不是合法 JSON');
          return;
        }
      }
      delete payload.dashboard_json_text;

      const url = editing
        ? `${getApiUrl()}/admin/dashboard/templates/${editing.template_id}`
        : `${getApiUrl()}/admin/dashboard/templates`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '保存失败');
      }
      message.success(editing ? '模板已更新' : '模板已创建');
      setEditOpen(false);
      fetchAll();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  const handleDelete = async (templateId: string) => {
    const res = await fetch(`${getApiUrl()}/admin/dashboard/templates/${templateId}`, { method: 'DELETE' });
    if (res.ok) {
      message.success('已删除');
      fetchAll();
    } else {
      message.error('删除失败');
    }
  };

  const handleSync = async () => {
    const res = await fetch(`${getApiUrl()}/admin/dashboard/templates/sync`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      message.success(`同步完成：内置 ${data.builtin} + 目录 ${data.catalog}`);
      fetchAll();
    } else {
      message.error('同步失败');
    }
  };

  const handlePreview = async (templateId: string) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreviewData(null);
    try {
      const res = await fetch(`${getApiUrl()}/templates/${encodeURIComponent(templateId)}`);
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {
      message.error('预览加载失败');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const normalizedPreview = useMemo(() => {
    if (!previewData) return null;
    return normalizeChartPayload(previewData, language);
  }, [previewData, language]);

  const categoryTabs = [
    { key: 'all', label: `全部 (${templates.length})` },
    ...categories.map((c) => ({
      key: c.category_id,
      label: `${c.name} (${c.template_count ?? 0})`,
    })),
  ];

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold m-0 flex items-center gap-2 text-[var(--text-primary)]">
            <LayoutDashboard size={22} className="text-[var(--accent-cyan)]" />
            大屏看板管理
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1 mb-0">
            {stats ? `${stats.total} 个模板 · ${stats.count_3d} 个含3D孪生` : '管理可视化大屏/驾驶舱/数字孪生模板'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<RefreshCw size={14} />} onClick={handleSync}>同步模板库</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新建模板</Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 shrink-0 flex-wrap">
        <Input
          prefix={<Search size={14} />}
          placeholder="搜索名称 / ID / 标签"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        <Select
          placeholder="风格筛选"
          allowClear
          style={{ width: 140 }}
          options={STYLE_OPTIONS}
          value={styleFilter}
          onChange={setStyleFilter}
        />
        <Switch checked={only3d} onChange={setOnly3d} checkedChildren="仅3D" unCheckedChildren="全部" />
      </div>

      <Tabs
        activeKey={activeCategory}
        onChange={setActiveCategory}
        items={categoryTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
        className="shrink-0"
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <Empty description="暂无模板，点击「同步模板库」导入" />
          ) : (
            <Row gutter={[16, 16]}>
              {filtered.map((tpl) => (
                <Col key={tpl.template_id} xs={24} sm={12} lg={8} xl={6}>
                  <Card
                    size="small"
                    className="h-full"
                    styles={{ body: { padding: 12 } }}
                    actions={[
                      <Tooltip key="preview" title="预览"><Eye size={15} onClick={() => handlePreview(tpl.template_id)} /></Tooltip>,
                      <Tooltip key="edit" title="编辑"><Edit size={15} onClick={() => openEdit(tpl)} /></Tooltip>,
                      <Popconfirm key="del" title="确认删除？" onConfirm={() => handleDelete(tpl.template_id)}>
                        <Trash2 size={15} className="text-red-400" />
                      </Popconfirm>,
                    ]}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-sm line-clamp-2">{tpl.name}</div>
                      {!tpl.is_enabled && <Tag color="default">禁用</Tag>}
                    </div>
                    <div className="text-xs text-gray-500 mb-2 font-mono">{tpl.template_id}</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <Tag color={styleColor[tpl.style] || 'blue'}>{tpl.style}</Tag>
                      {tpl.has_3d && <Tag icon={<Box size={10} />} color="purple">3D</Tag>}
                      {tpl.has_dashboard_json && <Tag icon={<Layers size={10} />} color="green">可预览</Tag>}
                    </div>
                    <div className="text-xs text-gray-400 line-clamp-2">{tpl.description || tpl.category_name}</div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </div>

      <Modal
        title={editing ? '编辑模板' : '新建模板'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          {!editing && (
            <Form.Item name="template_id" label="模板 ID" rules={[{ required: true }]}>
              <Input placeholder="如 my-dashboard-v1" />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category_id" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map((c) => ({ value: c.category_id, label: c.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="style" label="风格">
                <Select options={STYLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="scene" label="场景">
                <Select options={SCENE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <InputNumber min={0} max={100} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="数字孪生, RCS, 驾驶舱" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="has_3d" label="含3D" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="is_enabled" label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="preview_url" label="外链预览 URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="dashboard_json_text" label="Dashboard JSON（ECharts 面板定义）">
            <Input.TextArea rows={8} placeholder='{"type":"dashboard","panels":[...]}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="大屏预览"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="92vw"
        style={{ top: 20 }}
        styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflow: 'auto', background: '#0b1220' } }}
        destroyOnClose
      >
        <Spin spinning={previewLoading}>
          {normalizedPreview && normalizedPreview.kind === 'dashboard' ? (
            <DashboardGrid
              title={normalizedPreview.title}
              panels={normalizedPreview.panels}
              theme={theme}
              language={language}
            />
          ) : normalizedPreview && normalizedPreview.kind === 'single' ? (
            <DashboardGrid panels={[{ id: 'single', option: normalizedPreview.option }]} theme={theme} language={language} />
          ) : previewData?.preview_url ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-4">此外链模板需在线预览</p>
              <Button type="link" href={previewData.preview_url} target="_blank">{previewData.preview_url}</Button>
            </div>
          ) : (
            <Empty description="无法预览此模板" />
          )}
        </Spin>
      </Modal>
    </div>
  );
}
