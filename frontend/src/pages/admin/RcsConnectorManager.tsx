import React, { useCallback, useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Space, Tag, Tabs, InputNumber } from 'antd';
import { Plus, RefreshCw, Play, Download, Upload, CheckCircle2, Cable } from 'lucide-react';
import { getApiUrl } from '../../config';

interface Profile {
  profile_id: string;
  name: string;
  base_url: string;
  auth_type: string;
  auth_config?: Record<string, any>;
  timeout_ms: number;
  is_simulation: boolean;
  is_active: boolean;
  notes?: string;
}

interface Capability {
  id: string;
  tool_name: string;
  description: string;
  risk_level: string;
}

interface Binding {
  capability_id: string;
  method: string;
  path: string;
  query?: Record<string, any>;
  body?: any;
  response_map?: Record<string, any>;
  enabled: boolean;
  confirm_required?: boolean;
  risk_level_override?: string;
}

export default function RcsConnectorManager() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [bindingModal, setBindingModal] = useState(false);
  const [editingBinding, setEditingBinding] = useState<Binding | null>(null);
  const [profileForm] = Form.useForm();
  const [bindingForm] = Form.useForm();
  const [testCap, setTestCap] = useState('plc.read');
  const [testParams, setTestParams] = useState('{"tag_name":"DemoTag"}');
  const [testResult, setTestResult] = useState('');

  const api = getApiUrl();

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`${api}/admin/rcs/profiles`),
        fetch(`${api}/admin/rcs/capabilities`),
      ]);
      const plist = await pRes.json();
      const clist = await cRes.json();
      setProfiles(Array.isArray(plist) ? plist : []);
      setCapabilities(Array.isArray(clist) ? clist : []);
      if (!selectedId && plist?.length) {
        const active = plist.find((x: Profile) => x.is_active) || plist[0];
        setSelectedId(active.profile_id);
      }
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [api, selectedId]);

  const loadBindings = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`${api}/admin/rcs/profiles/${pid}/bindings`);
      const data = await res.json();
      setBindings(Array.isArray(data) ? data : []);
    } catch {
      setBindings([]);
    }
  }, [api]);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (selectedId) loadBindings(selectedId);
  }, [selectedId, loadBindings]);

  const selected = profiles.find((p) => p.profile_id === selectedId) || null;

  const openCreateProfile = () => {
    profileForm.resetFields();
    profileForm.setFieldsValue({
      auth_type: 'bearer',
      timeout_ms: 15000,
      is_simulation: true,
      base_url: 'http://localhost:9000',
    });
    setProfileModal(true);
  };

  const saveProfile = async () => {
    const values = await profileForm.validateFields();
    const payload = {
      ...values,
      auth_config: { token: values.token || '' },
    };
    delete payload.token;
    const res = await fetch(`${api}/admin/rcs/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success('已创建');
    setProfileModal(false);
    await loadProfiles();
  };

  const activate = async (id: string) => {
    const res = await fetch(`${api}/admin/rcs/profiles/${id}/activate`, { method: 'POST' });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success('已激活');
    await loadProfiles();
  };

  const removeProfile = async (id: string) => {
    Modal.confirm({
      title: '删除此连接器？',
      onOk: async () => {
        await fetch(`${api}/admin/rcs/profiles/${id}`, { method: 'DELETE' });
        if (selectedId === id) setSelectedId(null);
        await loadProfiles();
      },
    });
  };

  const seedNxp = async () => {
    const res = await fetch(`${api}/admin/rcs/seed/nxp`, { method: 'POST' });
    const data = await res.json();
    message.info(data.seeded ? '已种子化 NXP eRack' : `已有配置：${data.reason || 'ok'}`);
    await loadProfiles();
  };

  const applyNxpBindings = async () => {
    if (!selectedId) return;
    const res = await fetch(`${api}/admin/rcs/seed/nxp-bindings`);
    const bindingsTpl = await res.json();
    const put = await fetch(`${api}/admin/rcs/profiles/${selectedId}/bindings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bindings: bindingsTpl }),
    });
    if (!put.ok) {
      message.error(await put.text());
      return;
    }
    message.success('已应用 NXP 默认绑定');
    await loadBindings(selectedId);
  };

  const openBinding = (capId: string) => {
    const existing = bindings.find((b) => b.capability_id === capId);
    setEditingBinding(existing || null);
    bindingForm.setFieldsValue(
      existing
        ? {
            ...existing,
            query: JSON.stringify(existing.query || {}, null, 2),
            response_map: JSON.stringify(existing.response_map || {}, null, 2),
            body: existing.body != null ? JSON.stringify(existing.body, null, 2) : '',
          }
        : {
            capability_id: capId,
            method: 'GET',
            path: '/api/app/',
            query: '{}',
            response_map: '{"raw":"$"}',
            body: '',
            enabled: true,
          }
    );
    setBindingModal(true);
  };

  const saveBinding = async () => {
    if (!selectedId) return;
    const v = await bindingForm.validateFields();
    let query = {}, response_map = {}, body = null as any;
    try {
      query = JSON.parse(v.query || '{}');
      response_map = JSON.parse(v.response_map || '{}');
      body = v.body?.trim() ? JSON.parse(v.body) : null;
    } catch {
      message.error('JSON 字段解析失败');
      return;
    }
    const payload = {
      capability_id: v.capability_id,
      method: v.method,
      path: v.path,
      query,
      body,
      response_map,
      enabled: v.enabled !== false,
      confirm_required: !!v.confirm_required,
      risk_level_override: v.risk_level_override || null,
    };
    const res = await fetch(`${api}/admin/rcs/profiles/${selectedId}/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      message.error(await res.text());
      return;
    }
    message.success('绑定已保存');
    setBindingModal(false);
    await loadBindings(selectedId);
  };

  const runTest = async () => {
    if (!selectedId) return;
    let params = {};
    try {
      params = JSON.parse(testParams || '{}');
    } catch {
      message.error('测试参数 JSON 无效');
      return;
    }
    const res = await fetch(`${api}/admin/rcs/profiles/${selectedId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability_id: testCap, params }),
    });
    const data = await res.json();
    setTestResult(JSON.stringify(data, null, 2));
  };

  const exportPack = async () => {
    if (!selectedId) return;
    const res = await fetch(`${api}/admin/rcs/profiles/${selectedId}/export`);
    const pack = await res.json();
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rcs_connector_${selectedId}.json`;
    a.click();
  };

  const importPack = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const pack = JSON.parse(text);
      const res = await fetch(`${api}/admin/rcs/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack, activate: false }),
      });
      if (!res.ok) {
        message.error(await res.text());
        return;
      }
      message.success('导入成功');
      await loadProfiles();
    };
    input.click();
  };

  const bindingByCap = Object.fromEntries(bindings.map((b) => [b.capability_id, b]));

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cable className="text-[var(--accent-cyan)]" size={22} />
          <h1 className="text-xl font-bold m-0">RCS 连接器</h1>
        </div>
        <Space>
          <Button icon={<RefreshCw size={14} />} onClick={loadProfiles}>刷新</Button>
          <Button icon={<Upload size={14} />} onClick={importPack}>导入</Button>
          <Button onClick={seedNxp}>种子 NXP</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreateProfile}>新建 Profile</Button>
        </Space>
      </div>

      <p className="text-[var(--text-secondary)] text-sm mb-4">
        Agent 工具名固定（如 <code>fetch_task_stats</code> / <code>plc_read</code>），每个 RCS 项目用 Profile + HTTP 绑定适配真实接口。
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
          <Table
            loading={loading}
            rowKey="profile_id"
            size="small"
            dataSource={profiles}
            pagination={false}
            rowClassName={(r) => (r.profile_id === selectedId ? 'ant-table-row-selected' : '')}
            onRow={(r) => ({ onClick: () => setSelectedId(r.profile_id), style: { cursor: 'pointer' } })}
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                render: (v, r) => (
                  <span>
                    {v}{' '}
                    {r.is_active && <Tag color="cyan">ACTIVE</Tag>}
                    {r.is_simulation && <Tag>仿真</Tag>}
                  </span>
                ),
              },
              { title: 'Base URL', dataIndex: 'base_url', ellipsis: true },
              {
                title: '操作',
                width: 200,
                render: (_, r) => (
                  <Space size="small" onClick={(e) => e.stopPropagation()}>
                    {!r.is_active && (
                      <Button size="small" icon={<CheckCircle2 size={12} />} onClick={() => activate(r.profile_id)}>
                        激活
                      </Button>
                    )}
                    <Button size="small" danger onClick={() => removeProfile(r.profile_id)}>删</Button>
                  </Space>
                ),
              },
            ]}
          />
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
          {selected ? (
            <Tabs
              items={[
                {
                  key: 'bindings',
                  label: '能力绑定',
                  children: (
                    <>
                      <Space className="mb-3">
                        <Button size="small" onClick={applyNxpBindings}>应用 NXP 默认绑定</Button>
                        <Button size="small" icon={<Download size={12} />} onClick={exportPack}>导出</Button>
                      </Space>
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={capabilities}
                        columns={[
                          { title: '能力', dataIndex: 'id', width: 140 },
                          { title: '工具名', dataIndex: 'tool_name', width: 160 },
                          {
                            title: '状态',
                            render: (_, c) => {
                              const b = bindingByCap[c.id];
                              if (!b) return <Tag>未绑定</Tag>;
                              return b.enabled ? <Tag color="green">{b.method}</Tag> : <Tag color="orange">已禁用</Tag>;
                            },
                          },
                          {
                            title: '路径',
                            render: (_, c) => bindingByCap[c.id]?.path || '—',
                            ellipsis: true,
                          },
                          {
                            title: '编辑',
                            width: 80,
                            render: (_, c) => (
                              <Button size="small" onClick={() => openBinding(c.id)}>配置</Button>
                            ),
                          },
                        ]}
                      />
                    </>
                  ),
                },
                {
                  key: 'test',
                  label: '探测',
                  children: (
                    <div className="space-y-3">
                      <div className="text-sm text-[var(--text-secondary)]">
                        Profile: <b>{selected.name}</b> · {selected.base_url}
                      </div>
                      <Select
                        className="w-full"
                        value={testCap}
                        onChange={setTestCap}
                        options={capabilities.map((c) => ({ value: c.id, label: `${c.id} (${c.tool_name})` }))}
                      />
                      <Input.TextArea rows={3} value={testParams} onChange={(e) => setTestParams(e.target.value)} />
                      <Button type="primary" icon={<Play size={14} />} onClick={runTest}>Dry-Run</Button>
                      <Input.TextArea rows={12} value={testResult} readOnly placeholder="结果…" />
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <div className="text-[var(--text-secondary)] p-8 text-center">选择或创建一个 Profile</div>
          )}
        </div>
      </div>

      <Modal title="新建 RCS Profile" open={profileModal} onCancel={() => setProfileModal(false)} onOk={saveProfile} destroyOnClose>
        <Form form={profileForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="NXP TW eRack" />
          </Form.Item>
          <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="http://localhost:9000" />
          </Form.Item>
          <Form.Item name="auth_type" label="鉴权">
            <Select options={[
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'openid_password', label: 'OpenIddict Password' },
              { value: 'none', label: 'None' },
            ]} />
          </Form.Item>
          <Form.Item name="token" label="Token（Bearer）">
            <Input.Password placeholder="可留空" />
          </Form.Item>
          <Form.Item name="timeout_ms" label="超时(ms)">
            <InputNumber className="w-full" min={1000} step={1000} />
          </Form.Item>
          <Form.Item name="is_simulation" label="仿真环境" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingBinding ? '编辑绑定' : '配置绑定'} open={bindingModal} onCancel={() => setBindingModal(false)} onOk={saveBinding} width={720} destroyOnClose>
        <Form form={bindingForm} layout="vertical">
          <Form.Item name="capability_id" label="能力 ID" rules={[{ required: true }]}>
            <Input disabled={!!editingBinding} />
          </Form.Item>
          <Form.Item name="method" label="Method" rules={[{ required: true }]}>
            <Select options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => ({ value: m, label: m }))} />
          </Form.Item>
          <Form.Item name="path" label="Path" rules={[{ required: true }]}>
            <Input placeholder="/api/app/... 支持 {{var}}" />
          </Form.Item>
          <Form.Item name="query" label="Query JSON">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="body" label="Body JSON（可空）">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="response_map" label="Response Map JSON">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="confirm_required" label="需审批" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
