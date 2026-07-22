import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Switch, Select } from 'antd';
import { Plus, Edit, Trash2, Server, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getBaseUrl } from '../../config';

interface ConfigItem {
  config_key: string;
  config_value: string;
  category: string;
  description: string;
}

const IMAGE_KEYS = [
  'IMAGE_CLOUD_ENABLED',
  'IMAGE_BACKUP_ENABLED',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL_NAME',
] as const;

/** 对话模型改走「模型连接器」，避免双源编辑 */
const LLM_MANAGED_KEYS = [
  'LLM_MODEL_NAME',
  'LLM_TEMPERATURE',
  'LLM_MAX_TOKENS',
  'OLLAMA_BASE_URL',
  'OLLAMA_KEEP_ALIVE',
] as const;

function isTruthy(v?: string) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(v || '').trim().toLowerCase());
}

function maskSecret(value: string) {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}

export default function ConfigManager() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form] = Form.useForm();

  const [serverUrl, setServerUrl] = useState(() => getBaseUrl());

  // 文生图面板本地状态
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [imageBaseUrl, setImageBaseUrl] = useState('https://api.aicodewith.com');
  const [imageApiKey, setImageApiKey] = useState('');
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [keyDirty, setKeyDirty] = useState(false);

  const handleSaveServerUrl = () => {
    localStorage.setItem('SIDEA_SERVER_URL', serverUrl);
    message.success(t('common_saved'));
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const applyImageForm = (list: ConfigItem[]) => {
    const map = Object.fromEntries(list.map((c) => [c.config_key, c.config_value]));
    setCloudEnabled(isTruthy(map.IMAGE_CLOUD_ENABLED));
    setBackupEnabled(isTruthy(map.IMAGE_BACKUP_ENABLED));
    setImageBaseUrl(map.IMAGE_API_BASE_URL || 'https://api.aicodewith.com');
    setImageApiKey(map.IMAGE_API_KEY || '');
    setImageModel(map.IMAGE_MODEL_NAME || 'gpt-image-2');
    setKeyDirty(false);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/config`);
      const data = await res.json();
      setConfigs(data);
      applyImageForm(data);
    } catch (e) {
      console.error(e);
      message.error('Failed to load configs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const upsertConfig = async (
    key: string,
    value: string,
    category: string,
    description: string,
  ) => {
    const res = await fetch(`${getApiUrl()}/config/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config_value: value,
        category,
        description,
      }),
    });
    if (!res.ok) throw new Error(`save ${key} failed`);
  };

  const handleSaveImageSettings = async () => {
    setSavingImage(true);
    try {
      await upsertConfig(
        'IMAGE_CLOUD_ENABLED',
        cloudEnabled ? 'true' : 'false',
        'image',
        '是否启用云端写实生图（AICodeWith/OpenAI Images 兼容）',
      );
      await upsertConfig(
        'IMAGE_BACKUP_ENABLED',
        backupEnabled ? 'true' : 'false',
        'image',
        '是否启用 Pollinations 外网备用生图',
      );
      await upsertConfig('IMAGE_API_BASE_URL', imageBaseUrl.trim(), 'image', '云端生图服务地址');
      await upsertConfig('IMAGE_MODEL_NAME', imageModel.trim() || 'gpt-image-2', 'image', '云端生图模型名');
      // 只有用户改过 Key，或 Key 本就为空时才写回，避免把掩码写进库
      if (keyDirty || !imageApiKey.includes('••••')) {
        await upsertConfig('IMAGE_API_KEY', imageApiKey.trim(), 'image', '云端生图 API Key');
      }
      message.success(t('img_saved'));
      await fetchConfigs();
    } catch (e) {
      console.error(e);
      message.error(t('img_save_failed'));
    } finally {
      setSavingImage(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      const res = await fetch(`${getApiUrl()}/config/${values.config_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: values.config_value,
          category: values.category || 'general',
          description: values.description || '',
        }),
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

  const displayConfigs = configs.filter(
    (c) =>
      !IMAGE_KEYS.includes(c.config_key as any) &&
      !LLM_MANAGED_KEYS.includes(c.config_key as any),
  );

  const columns = [
    { title: 'Key', dataIndex: 'config_key', key: 'config_key' },
    {
      title: 'Value',
      dataIndex: 'config_value',
      key: 'config_value',
      render: (v: string, r: ConfigItem) =>
        /KEY|TOKEN|SECRET|PASSWORD/i.test(r.config_key) ? maskSecret(v) : v,
    },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: ConfigItem) => (
        <div className="flex gap-2">
          <Button
            type="text"
            icon={<Edit size={16} />}
            onClick={() => {
              setEditingKey(record.config_key);
              form.setFieldsValue(record);
              setIsModalOpen(true);
            }}
          />
          <Button
            type="text"
            danger
            icon={<Trash2 size={16} />}
            onClick={() => handleDelete(record.config_key)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold m-0 text-[var(--text-primary)]">{t('cfg_title')}</h2>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setEditingKey(null);
            form.resetFields();
            setIsModalOpen(true);
          }}
        >
          {t('cfg_add')}
        </Button>
      </div>

      <div className="bg-black/20 p-5 rounded-xl border border-[var(--border-color)] mb-8 flex flex-col gap-3">
        <h3 className="text-lg font-medium text-[var(--accent-cyan)] flex items-center gap-2 m-0">
          <Server size={18} />
          {t('cfg_api_title')}
        </h3>
        <p className="text-sm text-gray-400 m-0">{t('cfg_api_desc')}</p>
        <div className="flex gap-4 items-center">
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8000"
            className="max-w-md bg-black/40 border-gray-700 text-white"
          />
          <Button type="primary" onClick={handleSaveServerUrl}>
            {t('cfg_save_apply')}
          </Button>
        </div>
      </div>

      <div className="bg-black/20 p-5 rounded-xl border border-[var(--border-color)] mb-8 flex flex-col gap-4">
        <h3 className="text-lg font-medium text-[var(--accent-cyan)] flex items-center gap-2 m-0">
          <ImageIcon size={18} />
          {t('img_title')}
        </h3>
        <p className="text-sm text-gray-400 m-0">{t('img_desc')}</p>

        <div className="flex flex-wrap gap-8 items-center">
          <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
            <Switch checked={cloudEnabled} onChange={setCloudEnabled} />
            {t('img_cloud_switch')}
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
            <Switch checked={backupEnabled} onChange={setBackupEnabled} />
            {t('img_backup_switch')}
          </label>
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity ${
            cloudEnabled ? 'opacity-100' : 'opacity-50'
          }`}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">{t('img_base_url')}</span>
            <Input
              value={imageBaseUrl}
              disabled={!cloudEnabled}
              onChange={(e) => setImageBaseUrl(e.target.value)}
              placeholder="https://api.aicodewith.com"
              className="bg-black/40 border-gray-700 text-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">{t('img_model')}</span>
            <Select
              value={imageModel}
              disabled={!cloudEnabled}
              onChange={setImageModel}
              options={[
                { value: 'gpt-image-2', label: 'gpt-image-2' },
                { value: 'gpt-image-2-beta', label: 'gpt-image-2-beta' },
              ]}
              styles={{ popup: { root: { background: '#1a1a2e' } } }}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-gray-400">{t('img_api_key')}</span>
            <Input.Password
              value={keyDirty ? imageApiKey : maskSecret(imageApiKey) || imageApiKey}
              disabled={!cloudEnabled}
              visibilityToggle
              onFocus={() => {
                if (!keyDirty && imageApiKey) {
                  setImageApiKey('');
                  setKeyDirty(true);
                }
              }}
              onChange={(e) => {
                setImageApiKey(e.target.value);
                setKeyDirty(true);
              }}
              placeholder={cloudEnabled ? t('img_key_placeholder_on') : t('img_key_placeholder_off')}
              className="bg-black/40 border-gray-700 text-white"
            />
            <span className="text-xs text-gray-500">{t('img_key_hint')}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="primary" loading={savingImage} onClick={handleSaveImageSettings}>
            {t('img_save')}
          </Button>
          <span className="text-xs text-gray-500">
            {t('img_effective')}
            {cloudEnabled ? t('img_eff_cloud') : backupEnabled ? t('img_eff_backup') : t('img_eff_offline')}
          </span>
        </div>
      </div>

      <div className="bg-black/20 p-4 rounded-xl border border-[var(--border-color)] mb-6 text-sm text-gray-400">
        对话模型（Ollama / OpenAI / Gemini / 中转）请到左侧「模型连接器」配置；此处不再编辑{' '}
        <code className="text-[var(--accent-cyan)]">LLM_*</code> /{' '}
        <code className="text-[var(--accent-cyan)]">OLLAMA_*</code> 键。
      </div>

      <h3 className="text-lg font-medium text-white mb-4">{t('cfg_backend_table')}</h3>

      <Table
        dataSource={displayConfigs}
        columns={columns}
        rowKey="config_key"
        loading={loading}
        pagination={{ pageSize: 10 }}
        className="glass-panel"
      />

      <Modal
        title={editingKey ? 'Edit Config' : 'New Config'}
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
            <Button type="primary" htmlType="submit">
              Save
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
