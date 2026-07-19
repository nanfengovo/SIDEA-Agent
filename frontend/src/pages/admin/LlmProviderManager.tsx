import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, message, Space, Tag, InputNumber, Collapse,
} from 'antd';
import { Plus, RefreshCw, Play, CheckCircle2, Brain, Download } from 'lucide-react';
import { getApiUrl } from '../../config';

interface LlmProfile {
  profile_id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key?: string;
  api_key_set?: boolean;
  model_name: string;
  temperature: number;
  max_tokens?: number | null;
  extra_config?: Record<string, any>;
  is_enabled: boolean;
  is_active: boolean;
  notes?: string;
}

interface ModelItem {
  id: string;
  name: string;
  category: string;
  supports_chat?: boolean;
  description?: string;
}

interface ModelGroup {
  category: string;
  models: ModelItem[];
}

const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'openai', label: 'OpenAI 官方' },
  { value: 'openai_compatible', label: 'OpenAI 兼容中转' },
  { value: 'gemini_native', label: 'Gemini 原生' },
];

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  gemini_native: { label: 'Google Gemini', color: 'purple' },
  openai: { label: 'OpenAI 官方', color: 'green' },
  openai_compatible: { label: 'OpenAI 兼容中转', color: 'blue' },
  ollama: { label: 'Ollama（本地）', color: 'cyan' },
};

const PROVIDER_ORDER = ['gemini_native', 'openai', 'openai_compatible', 'ollama'];

export default function LlmProviderManager() {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyDirty, setKeyDirty] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [allModels, setAllModels] = useState<ModelItem[]>([]);
  const [chatOnly, setChatOnly] = useState(true);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [form] = Form.useForm();
  const api = getApiUrl();

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/admin/llm/profiles`);
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const profilesByProvider = useMemo(() => {
    const map: Record<string, LlmProfile[]> = {};
    for (const p of profiles) {
      const key = p.provider || 'other';
      (map[key] ||= []).push(p);
    }
    const ordered: { key: string; label: string; color: string; profiles: LlmProfile[] }[] = [];
    for (const key of PROVIDER_ORDER) {
      if (map[key]?.length) {
        ordered.push({
          key,
          label: PROVIDER_META[key]?.label || key,
          color: PROVIDER_META[key]?.color || 'default',
          profiles: map[key],
        });
        delete map[key];
      }
    }
    for (const [key, list] of Object.entries(map)) {
      ordered.push({
        key,
        label: PROVIDER_META[key]?.label || key,
        color: PROVIDER_META[key]?.color || 'default',
        profiles: list,
      });
    }
    return ordered;
  }, [profiles]);

  const openCreate = () => {
    setEditingId(null);
    setKeyDirty(true);
    setTestResult('');
    setAllModels([]);
    form.resetFields();
    form.setFieldsValue({
      provider: 'gemini_native',
      temperature: 0.1,
      is_enabled: true,
      base_url: '',
      model_name: 'gemini-2.5-flash-lite',
    });
    setModalOpen(true);
  };

  const openEdit = (p: LlmProfile) => {
    setEditingId(p.profile_id);
    setKeyDirty(false);
    setTestResult('');
    setAllModels([]);
    form.setFieldsValue({
      profile_id: p.profile_id,
      name: p.name,
      provider: p.provider,
      base_url: p.base_url,
      api_key: p.api_key_set ? p.api_key : '',
      model_name: p.model_name,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      is_enabled: p.is_enabled,
      notes: p.notes,
      num_ctx: p.extra_config?.num_ctx,
      num_predict: p.extra_config?.num_predict,
    });
    setModalOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    const extra_config: Record<string, any> = {};
    if (values.num_ctx) extra_config.num_ctx = values.num_ctx;
    if (values.num_predict) extra_config.num_predict = values.num_predict;

    const payload: Record<string, any> = {
      name: values.name,
      provider: values.provider,
      base_url: values.base_url || '',
      model_name: values.model_name,
      temperature: values.temperature ?? 0.1,
      max_tokens: values.max_tokens ?? null,
      is_enabled: values.is_enabled ?? true,
      notes: values.notes || '',
      extra_config,
    };
    if (keyDirty || !editingId) {
      payload.api_key = values.api_key || '';
    }
    if (!editingId && values.profile_id) {
      payload.profile_id = values.profile_id;
    }

    const url = editingId
      ? `${api}/admin/llm/profiles/${editingId}`
      : `${api}/admin/llm/profiles`;
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success(editingId ? '已更新' : '已创建');
    setModalOpen(false);
    loadProfiles();
  };

  const activate = async (id: string) => {
    const res = await fetch(`${api}/admin/llm/profiles/${id}/activate`, { method: 'POST' });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success('已激活');
    loadProfiles();
  };

  const setDashboardTier = async (id: string, tier: 'template' | 'freeform' | '') => {
    const p = profiles.find((x) => x.profile_id === id);
    if (!p) return;
    const extra = { ...(p.extra_config || {}) };
    if (!tier) delete extra.dashboard_tier;
    else extra.dashboard_tier = tier;
    const res = await fetch(`${api}/admin/llm/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_config: extra }),
    });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success(tier ? `已设为大屏档位: ${tier}` : '已清除档位覆盖（按 Provider 自动判定）');
    loadProfiles();
  };

  const remove = async (id: string) => {
    if (!window.confirm(`删除 Profile ${id}？`)) return;
    const res = await fetch(`${api}/admin/llm/profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success('已删除');
    loadProfiles();
  };

  const testProfile = async (id: string) => {
    setTestResult('探测中…');
    const res = await fetch(`${api}/admin/llm/profiles/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Reply with exactly: OK' }),
    });
    const data = await res.json();
    if (data.ok) {
      setTestResult(`✓ ${data.latency_ms}ms · ${data.provider}/${data.model_name}\n${data.reply || ''}`);
      message.success(`探测成功 (${data.latency_ms}ms)`);
    } else {
      setTestResult(`✗ ${data.error || '失败'}`);
      message.error(data.error || '探测失败');
    }
  };

  const fetchModels = async () => {
    const values = form.getFieldsValue();
    const provider = values.provider;
    if (!provider) {
      message.warning('请先选择 Provider');
      return;
    }
    setFetchingModels(true);
    try {
      let res: Response;
      // 始终拉全量，前端再用「仅可对话」开关过滤，避免误以为 Google 没返回
      if (editingId) {
        res = await fetch(`${api}/admin/llm/profiles/${editingId}/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: keyDirty ? (values.api_key || '') : '',
            chat_only: false,
          }),
        });
      } else {
        res = await fetch(`${api}/admin/llm/models/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            api_key: values.api_key || '',
            base_url: values.base_url || '',
            chat_only: false,
          }),
        });
      }
      const data = await res.json();
      if (!data.ok) {
        message.error(data.error || '拉取失败');
        setAllModels([]);
        return;
      }
      const list: ModelItem[] = Array.isArray(data.models) ? data.models : [];
      setAllModels(list);
      const chatCount = list.filter((m) => m.supports_chat).length;
      message.success(`已拉取 ${list.length} 个模型（其中可对话 ${chatCount} 个）`);
    } catch (e: any) {
      message.error(e?.message || '拉取失败');
    } finally {
      setFetchingModels(false);
    }
  };

  const modelGroups = useMemo((): ModelGroup[] => {
    const filtered = chatOnly ? allModels.filter((m) => m.supports_chat) : allModels;
    const order: string[] = [];
    const buckets: Record<string, ModelItem[]> = {};
    for (const m of filtered) {
      const cat = m.category || 'Other';
      if (!buckets[cat]) {
        buckets[cat] = [];
        order.push(cat);
      }
      buckets[cat].push(m);
    }
    return order.map((category) => ({ category, models: buckets[category] }));
  }, [allModels, chatOnly]);

  const modelSelectOptions = useMemo(() => {
    if (!modelGroups.length) return undefined;
    return modelGroups.map((g) => ({
      label: `${g.category} (${g.models.length})`,
      options: g.models.map((m) => ({
        value: m.id,
        label: `${m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}${m.supports_chat ? '' : ' · 非对话'}`,
      })),
    }));
  }, [modelGroups]);

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: LlmProfile) => (
        <div>
          <div className="font-medium text-[var(--text-primary)]">{v}</div>
          <div className="text-xs text-gray-500 font-mono">{r.profile_id}</div>
        </div>
      ),
    },
    {
      title: '模型 ID',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (v: string) => <span className="font-mono text-xs">{v}</span>,
    },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      ellipsis: true,
      render: (v: string) => v || <span className="text-gray-500">—</span>,
    },
    {
      title: '大屏档位',
      key: 'tier',
      width: 160,
      render: (_: any, r: LlmProfile) => {
        const override = r.extra_config?.dashboard_tier;
        const auto =
          r.provider === 'ollama' ? 'template' : 'freeform';
        const cur = override || auto;
        return (
          <Select
            size="small"
            style={{ width: 140 }}
            value={override || 'auto'}
            onChange={(v) => setDashboardTier(r.profile_id, v === 'auto' ? '' : v)}
            options={[
              { value: 'auto', label: `自动(${cur === 'freeform' ? '自由出图' : '模板'})` },
              { value: 'freeform', label: '强制自由出图' },
              { value: 'template', label: '强制模板档' },
            ]}
          />
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, r: LlmProfile) => (
        <Space size={4}>
          {r.is_active && <Tag color="success" icon={<CheckCircle2 size={12} />}>Active</Tag>}
          {r.is_enabled ? <Tag color="cyan">启用</Tag> : <Tag>停用</Tag>}
          {r.api_key_set && <Tag>Key</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, r: LlmProfile) => (
        <Space wrap size="small">
          <Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button>
          {!r.is_active && (
            <Button size="small" type="link" onClick={() => activate(r.profile_id)}>激活</Button>
          )}
          <Button size="small" type="link" icon={<Play size={12} />} onClick={() => testProfile(r.profile_id)}>
            探测
          </Button>
          {!r.is_active && (
            <Button size="small" type="link" danger onClick={() => remove(r.profile_id)}>删除</Button>
          )}
        </Space>
      ),
    },
  ];

  const provider = Form.useWatch('provider', form);
  const modelNameWatch = Form.useWatch('model_name', form);
  const needsKey = provider && provider !== 'ollama';
  const needsUrl = provider !== 'gemini_native';

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
            <Brain size={22} className="text-[var(--accent-cyan)]" />
            模型连接器
          </h2>
          <p className="text-sm text-gray-400 mt-1 mb-0">
            按提供商分组管理 Profile。顶部下拉只显示「已启用的 Profile」，不是 Google 全量模型目录；换模型请在此编辑或新建 Profile。
          </p>
        </div>
        <Space>
          <Button icon={<RefreshCw size={14} />} onClick={loadProfiles}>刷新</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新建 Profile</Button>
        </Space>
      </div>

      {testResult && (
        <pre className="mb-4 p-3 rounded-lg bg-black/30 border border-[var(--border-color)] text-xs text-[var(--accent-cyan)] whitespace-pre-wrap">
          {testResult}
        </pre>
      )}

      <Collapse
        defaultActiveKey={PROVIDER_ORDER}
        className="bg-transparent border-0"
        items={profilesByProvider.map((g) => ({
          key: g.key,
          label: (
            <Space>
              <Tag color={g.color}>{g.label}</Tag>
              <span className="text-xs text-gray-400">{g.profiles.length} 个 Profile</span>
            </Space>
          ),
          children: (
            <Table
              rowKey="profile_id"
              loading={loading}
              dataSource={g.profiles}
              columns={columns}
              pagination={false}
              size="small"
              className="glass-panel"
            />
          ),
        }))}
      />

      {!profiles.length && !loading && (
        <div className="text-center text-gray-500 py-12">暂无 Profile，点击「新建」或等待启动种子</div>
      )}

      <Modal
        title={editingId ? '编辑 LLM Profile' : '新建 LLM Profile'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-2">
          {!editingId && (
            <Form.Item name="profile_id" label="Profile ID（可选）">
              <Input placeholder="自动生成；如 gemini_flash_lite" />
            </Form.Item>
          )}
          <Form.Item name="name" label="显示名称" rules={[{ required: true }]}>
            <Input placeholder="顶部下拉显示名" />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select
              options={PROVIDER_OPTIONS}
              onChange={() => setAllModels([])}
            />
          </Form.Item>
          {needsUrl && (
            <Form.Item name="base_url" label="Base URL" rules={[{ required: provider === 'ollama' || provider === 'openai_compatible' }]}>
              <Input placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'} />
            </Form.Item>
          )}
          {needsKey && (
            <Form.Item name="api_key" label="API Key" rules={[{ required: !editingId }]}>
              <Input.Password
                visibilityToggle
                onFocus={() => {
                  if (!keyDirty && editingId) {
                    form.setFieldValue('api_key', '');
                    setKeyDirty(true);
                  }
                }}
                onChange={() => setKeyDirty(true)}
                placeholder={editingId ? '留空或点聚焦后重填以更新' : 'API Key'}
              />
            </Form.Item>
          )}
          <Form.Item label="模型" required>
            <div className="flex gap-2 items-start">
              <Form.Item name="model_name" noStyle rules={[{ required: true, message: '请选择或填写模型 ID' }]}>
                <Select
                  showSearch
                  className="flex-1"
                  placeholder="选择或输入模型 ID"
                  options={modelSelectOptions}
                  optionFilterProp="label"
                  listHeight={360}
                  dropdownStyle={{ minWidth: 480 }}
                  notFoundContent={allModels.length ? '无匹配' : '先拉取列表，或在下方输入模型 ID'}
                />
              </Form.Item>
              <Button
                icon={<Download size={14} />}
                loading={fetchingModels}
                onClick={fetchModels}
              >
                拉取可用模型
              </Button>
            </div>
            <Input
              className="mt-2"
              placeholder="或直接粘贴模型 ID，如 gemini-2.5-flash-lite"
              value={modelNameWatch || ''}
              onChange={(e) => form.setFieldValue('model_name', e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <Switch size="small" checked={chatOnly} onChange={setChatOnly} />
                仅显示可对话模型（generateContent）
              </label>
              {!!allModels.length && (
                <span className="text-xs text-gray-500">
                  全量 {allModels.length} · 当前展示 {modelGroups.reduce((n, g) => n + g.models.length, 0)} ·
                  {' '}分类：{modelGroups.map((g) => `${g.category}(${g.models.length})`).join(' · ')}
                </span>
              )}
            </div>
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="temperature" label="Temperature">
              <InputNumber min={0} max={2} step={0.1} className="w-full" />
            </Form.Item>
            <Form.Item name="max_tokens" label="Max Tokens">
              <InputNumber min={1} className="w-full" placeholder="可选" />
            </Form.Item>
          </div>
          {provider === 'ollama' && (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="num_ctx" label="num_ctx">
                <InputNumber min={1024} className="w-full" placeholder="8192" />
              </Form.Item>
              <Form.Item name="num_predict" label="num_predict">
                <InputNumber min={256} className="w-full" placeholder="8192" />
              </Form.Item>
            </div>
          )}
          <Form.Item name="is_enabled" label="出现在顶部下拉" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
