/**
 * TemplateImportModal — 大屏模板导入弹窗
 * 支持三种导入方式：
 *  1. URL 导入（GitHub/Gitee/EasyV/DataEase 链接）
 *  2. JSON 元数据导入
 *  3. JSON 文件上传（批量）
 */
import React, { useState, useRef } from 'react';
import { X, Link, Code, Upload, Check, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';

interface ImportResult {
  status: 'success' | 'error';
  template_id?: string;
  inserted?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const STYLES = ['科技蓝', '赛博朋克', '暗金', '工业橙', '全息投影', '矩阵绿', '告警红', '极简白'];
const CATEGORIES = [
  { value: 'digital_twin',  label: '数字孪生' },
  { value: 'cockpit',       label: '企业驾驶舱' },
  { value: 'operations',    label: '运营监控' },
  { value: 'industry',      label: '行业大屏' },
  { value: 'smart_scene',   label: '智慧场景' },
  { value: 'visualization', label: '可视化大屏' },
  { value: 'kpi_board',     label: '数据看板' },
];

type Mode = 'url' | 'json' | 'file';

export function TemplateImportModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('url');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL mode state
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [urlCategory, setUrlCategory] = useState('visualization');
  const [urlStyle, setUrlStyle] = useState('科技蓝');
  const [urlScenario, setUrlScenario] = useState('通用');
  const [urlDesc, setUrlDesc] = useState('');

  // JSON mode state
  const [jsonText, setJsonText] = useState(`{
  "template_id": "my_custom_dashboard",
  "name": "我的自定义大屏",
  "category": "visualization",
  "style": "科技蓝",
  "scenario": "通用",
  "description": "描述这个模板的用途...",
  "has_3d": 0,
  "source": "自定义",
  "layout_config": {
    "subcategory": "custom",
    "tags": ["自定义"],
    "complexity": "medium",
    "chart_types": ["line", "bar", "pie"]
  }
}`);
  const [jsonError, setJsonError] = useState('');

  const handleUrlImport = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/templates/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          name: urlName || undefined,
          category: urlCategory,
          style: urlStyle,
          scenario: urlScenario,
          description: urlDesc,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.status === 'success') setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setResult({ status: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleJsonImport = async () => {
    setJsonError('');
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      setJsonError(`JSON 格式错误: ${e.message}`);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const templates = Array.isArray(parsed) ? parsed : [parsed];
      // Stringify layout_config if it's an object
      const processed = templates.map((t: any) => ({
        ...t,
        layout_config: typeof t.layout_config === 'object'
          ? JSON.stringify(t.layout_config)
          : t.layout_config,
      }));

      const res = await fetch('/api/templates/import/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: processed, overwrite: false }),
      });
      const data = await res.json();
      setResult(data);
      if (data.status === 'success' && (data.inserted || 0) > 0) setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setResult({ status: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setResult({ status: 'error', message: '只支持 .json 文件' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/templates/import/file', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      setResult(data);
      if (data.status === 'success' && (data.inserted || 0) > 0) setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setResult({ status: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const MODES: { id: Mode; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: 'url',  icon: <Link size={16} />,    label: 'URL 导入',  desc: 'GitHub / Gitee / EasyV / DataEase 链接' },
    { id: 'json', icon: <Code size={16} />,    label: 'JSON 元数据', desc: '手动填写或粘贴模板元数据 JSON' },
    { id: 'file', icon: <Upload size={16} />,  label: '文件上传',  desc: '上传 .json 文件批量导入' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)] shrink-0">
          <div>
            <h2 className="text-lg font-bold">导入大屏模板</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">支持 URL、JSON 元数据、文件三种方式</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-[var(--text-secondary)]">
            <X size={18} />
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 p-4 border-b border-[var(--border-color)] shrink-0">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setResult(null); }}
              className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-left ${
                mode === m.id
                  ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-white/20 hover:bg-white/5'
              }`}
            >
              {m.icon}
              <span className="text-xs font-semibold">{m.label}</span>
              <span className="text-[10px] opacity-60 text-center leading-tight">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {mode === 'url' && (
            <UrlForm
              url={url} setUrl={setUrl}
              name={urlName} setName={setUrlName}
              category={urlCategory} setCategory={setUrlCategory}
              style={urlStyle} setStyle={setUrlStyle}
              scenario={urlScenario} setScenario={setUrlScenario}
              desc={urlDesc} setDesc={setUrlDesc}
            />
          )}

          {mode === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">模板 JSON 元数据</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setJsonText(JSON.stringify(jsonTemplates.single, null, 2))}
                    className="text-xs text-[var(--accent-cyan)] hover:underline"
                  >单个模板示例</button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={() => setJsonText(JSON.stringify(jsonTemplates.batch, null, 2))}
                    className="text-xs text-[var(--accent-cyan)] hover:underline"
                  >批量导入示例</button>
                </div>
              </div>
              <textarea
                value={jsonText}
                onChange={e => { setJsonText(e.target.value); setJsonError(''); }}
                rows={16}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:border-[var(--accent-cyan)]"
                placeholder="粘贴 JSON 模板元数据..."
              />
              {jsonError && (
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <AlertCircle size={12} /> {jsonError}
                </div>
              )}
              <div className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg p-3">
                <p className="font-semibold mb-1 text-[var(--text-primary)]">字段说明：</p>
                <p>• <code className="text-[var(--accent-cyan)]">category</code>: digital_twin / cockpit / operations / industry / smart_scene / visualization / kpi_board</p>
                <p>• <code className="text-[var(--accent-cyan)]">style</code>: 科技蓝 / 赛博朋克 / 暗金 / 工业橙 / 全息投影 / 矩阵绿 / 告警红 / 极简白</p>
                <p>• <code className="text-[var(--accent-cyan)]">layout_config.tags</code>: 标签数组，用于 Agent 精确匹配</p>
              </div>
            </div>
          )}

          {mode === 'file' && (
            <div
              className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-10 flex flex-col items-center justify-center gap-4 hover:border-[var(--accent-cyan)]/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
            >
              <Upload size={32} className="text-[var(--text-secondary)]" />
              <div className="text-center">
                <p className="font-medium">拖拽或点击上传 JSON 文件</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">支持单个模板或模板数组的 .json 文件</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <div className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg p-3 w-full">
                <p className="font-semibold mb-1">JSON 格式示例：</p>
                <pre className="text-[10px] text-[var(--accent-cyan)] overflow-auto">{`[
  { "name": "...", "category": "cockpit", "style": "暗金", ... },
  { "name": "...", "category": "operations", ... }
]`}</pre>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${
              result.status === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}>
              {result.status === 'success'
                ? <Check size={18} className="shrink-0 mt-0.5" />
                : <AlertCircle size={18} className="shrink-0 mt-0.5" />
              }
              <div className="text-sm space-y-1">
                {result.status === 'success' ? (
                  <>
                    <p className="font-semibold">导入成功！</p>
                    {result.template_id && <p>模板 ID: <code className="font-mono">{result.template_id}</code></p>}
                    {result.inserted !== undefined && <p>已导入 <strong>{result.inserted}</strong> 个模板，跳过 {result.skipped} 个</p>}
                  </>
                ) : (
                  <p>{result.message || '导入失败，请检查数据格式'}</p>
                )}
                {result.errors && result.errors.length > 0 && (
                  <ul className="text-xs space-y-0.5 mt-1">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-color)] flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-white/10 transition-colors">
            取消
          </button>
          {mode !== 'file' && (
            <button
              onClick={mode === 'url' ? handleUrlImport : handleJsonImport}
              disabled={loading || (mode === 'url' && !url.trim())}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-[var(--accent-cyan)] text-black font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              {loading ? '导入中...' : '确认导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── URL Form ── */
function UrlForm({ url, setUrl, name, setName, category, setCategory, style, setStyle, scenario, setScenario, desc, setDesc }: any) {
  const suggestions = [
    { label: 'BigDataView 智慧工厂', url: 'https://gitee.com/iGaoWei/big-data-view' },
    { label: 'GoView 工业大屏', url: 'https://gitee.com/MTrun/go-view' },
    { label: 'DataEase 模板市场', url: 'https://templates.dataease.cn' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">模板页面 URL *</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/... 或 https://gitee.com/..."
          className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-3 text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
        />
        <div className="flex gap-2 flex-wrap mt-1">
          {suggestions.map(s => (
            <button key={s.url} onClick={() => setUrl(s.url)}
              className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20">
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">模板名称</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="给这个模板起个名字..."
            className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[var(--accent-cyan)]" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">场景</label>
          <input value={scenario} onChange={e => setScenario(e.target.value)}
            placeholder="e.g. 智慧工厂 / RCS监控"
            className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[var(--accent-cyan)]" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">分类</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-2.5 text-sm">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">视觉风格</label>
          <select value={style} onChange={e => setStyle(e.target.value)}
            className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-2.5 text-sm">
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">描述（可选）</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          rows={2} placeholder="描述这个模板的特点和适用场景..."
          className="w-full bg-black/40 border border-[var(--border-color)] rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:border-[var(--accent-cyan)]" />
      </div>
      <div className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg p-3">
        <p>ℹ️ URL 导入会将链接存储为模板来源，点击预览时将在 iframe 中渲染该页面。</p>
        <p>✅ 支持 GitHub Pages 预览链接、Gitee Pages、EasyV 公开案例等可直接访问的 HTML 页面。</p>
      </div>
    </div>
  );
}

/* ── Example JSON templates ── */
const jsonTemplates = {
  single: {
    template_id: "my_rcs_monitor_v1",
    name: "RCS 实时运营监控",
    category: "operations",
    style: "科技蓝",
    scenario: "RCS监控",
    description: "AGV调度、任务完成率、区域热力的综合监控大屏",
    has_3d: 0,
    source: "自定义",
    layout_config: {
      subcategory: "rcs_monitor",
      tags: ["RCS", "AGV", "实时", "监控"],
      complexity: "high",
      kpi_count: 5,
      chart_types: ["line", "heatmap", "pie", "bar", "kpi_list"]
    }
  },
  batch: [
    {
      template_id: "factory_prod_board",
      name: "工厂生产日报看板",
      category: "kpi_board",
      style: "极简白",
      scenario: "工厂生产",
      description: "产量、OEE、不良率的日报分析看板",
      has_3d: 0,
      source: "自定义",
      layout_config: { subcategory: "kpi_board", tags: ["工厂", "日报", "OEE"], complexity: "low", chart_types: ["bar", "gauge", "number_card"] }
    },
    {
      template_id: "energy_twin_plant",
      name: "能源管网数字孪生",
      category: "digital_twin",
      style: "全息投影",
      scenario: "能源管网",
      description: "能源管网3D拓扑、用电趋势、告警监控",
      has_3d: 1,
      source: "自定义",
      layout_config: { subcategory: "energy_twin", tags: ["能源", "电力", "3D", "孪生"], complexity: "high", chart_types: ["map3d", "line", "gauge"] }
    }
  ]
};
