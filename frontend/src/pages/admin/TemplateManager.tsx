import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Edit, Check, X, Eye, LayoutGrid, List, Search, Cpu, Download } from 'lucide-react';
import { DashboardTemplatePreview } from '../../components/DashboardTemplatePreview';
import { TemplateImportModal } from '../../components/TemplateImportModal';

interface Template {
  template_id: string;
  name: string;
  category: string;
  description: string;
  layout_config: string;
  style: string;
  scenario: string;
  has_3d: number;
  source: string;
  preview_url: string;
  is_enabled: number;
}

const STYLE_COLORS: Record<string, { bg: string; accent: string; border: string }> = {
  '科技蓝':   { bg: '#010D1A', accent: '#00D4FF', border: 'rgba(0,212,255,0.4)' },
  '赛博朋克': { bg: '#05000D', accent: '#FF00FF', border: 'rgba(255,0,255,0.4)' },
  '暗金':     { bg: '#0A0800', accent: '#FFD700', border: 'rgba(255,215,0,0.4)' },
  '工业橙':   { bg: '#080A0F', accent: '#FF6600', border: 'rgba(255,102,0,0.4)' },
  '全息投影': { bg: '#020E0A', accent: '#00FFCC', border: 'rgba(0,255,204,0.4)' },
  '矩阵绿':   { bg: '#000500', accent: '#00FF41', border: 'rgba(0,255,65,0.4)' },
  '告警红':   { bg: '#0D0000', accent: '#FF2222', border: 'rgba(255,34,34,0.4)' },
  '极简白':   { bg: '#F8FAFC', accent: '#3B82F6', border: 'rgba(59,130,246,0.4)' },
  // Legacy keys
  '工业':     { bg: '#080A0F', accent: '#FF6600', border: 'rgba(255,102,0,0.4)' },
  '全息':     { bg: '#020E0A', accent: '#00FFCC', border: 'rgba(0,255,204,0.4)' },
  '极简':     { bg: '#0E0E12', accent: '#E2E8F0', border: 'rgba(226,232,240,0.3)' },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  digital_twin:  { label: '数字孪生',   icon: '🔷', color: '#00FFCC' },
  cockpit:       { label: '企业驾驶舱', icon: '🏆', color: '#FFD700' },
  operations:    { label: '运营监控',   icon: '📡', color: '#00D4FF' },
  industry:      { label: '行业大屏',   icon: '🏭', color: '#FF6600' },
  smart_scene:   { label: '智慧场景',   icon: '🌆', color: '#A78BFA' },
  visualization: { label: '可视化大屏', icon: '🎭', color: '#FF00FF' },
  kpi_board:     { label: '数据看板',   icon: '📊', color: '#64748B' },
};

function getStyleColor(style: string) {
  return STYLE_COLORS[style] || STYLE_COLORS['科技蓝'];
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [stats, setStats] = useState<{total: number; by_category: Record<string,number>} | null>(null);

  // Filters
  const [filterStyle, setFilterStyle] = useState('');
  const [filterScenario, setFilterScenario] = useState('');
  const [filter3D, setFilter3D] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchStats();
  }, [filterStyle, filterScenario, filter3D, filterCategory]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/templates/meta/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) { /* silent */ }
  };

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStyle) params.append('style', filterStyle);
      if (filterScenario) params.append('scenario', filterScenario);
      if (filter3D) params.append('has_3d', filter3D);
      if (filterCategory) params.append('category', filterCategory);
      const res = await fetch(`/api/templates/?${params.toString()}`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnable = async (template: Template) => {
    try {
      const res = await fetch(`/api/templates/${template.template_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: template.is_enabled ? 0 : 1 }),
      });
      if (res.ok) fetchTemplates();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (template_id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      const res = await fetch(`/api/templates/${template_id}`, { method: 'DELETE' });
      if (res.ok) fetchTemplates();
    } catch (e) { console.error(e); }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTpl) return;
    try {
      const method = isAdding ? 'POST' : 'PUT';
      const url = isAdding ? '/api/templates/' : `/api/templates/${editingTpl.template_id}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTpl),
      });
      if (res.ok) {
        setEditingTpl(null);
        setIsAdding(false);
        fetchTemplates();
      } else {
        alert('保存失败，可能 ID 已存在');
      }
    } catch (err) { console.error(err); }
  };

  const filteredTemplates = templates.filter(t =>
    !searchQuery ||
    t.name.includes(searchQuery) ||
    t.template_id.includes(searchQuery) ||
    t.description.includes(searchQuery) ||
    t.scenario.includes(searchQuery)
  );

  return (
    <div className="h-full flex flex-col p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">大屏模板库</h1>
          <p className="text-[var(--text-secondary)] text-sm">
            管理工业驾驶舱大屏模板 · 共{' '}
            <span className="text-[var(--accent-cyan)] font-bold">{stats?.total ?? templates.length}</span>{' '}
            套模板
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-black/40 border border-[var(--border-color)] rounded overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'grid' ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'table' ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              <List size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 border border-[var(--accent-cyan)]/50 text-[var(--accent-cyan)] px-4 py-2 rounded font-medium hover:bg-[var(--accent-cyan)]/10 transition-colors"
          >
            <Download size={16} /> 导入模板
          </button>
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingTpl({
                template_id: '', name: '', category: 'visualization', description: '',
                style: '科技蓝', scenario: '通用', has_3d: 0, source: 'SIDEA原生',
                preview_url: '', layout_config: '{"subcategory":"","tags":[],"complexity":"medium","chart_types":[]}', is_enabled: 1,
              });
            }}
            className="flex items-center gap-2 bg-[var(--accent-cyan)] text-[#0f172a] px-4 py-2 rounded font-medium hover:brightness-110"
          >
            <Plus size={16} /> 新增模板
          </button>
        </div>
      </div>

      {/* ── Category Tab Strip ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        <button
          onClick={() => setFilterCategory('')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
            filterCategory === ''
              ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]'
              : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-white/20'
          }`}
        >
          📊 全部
          {stats && <span className="bg-[var(--accent-cyan)]/20 px-1.5 py-0.5 rounded-full text-[10px]">{stats.total}</span>}
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, { label, icon, color }]) => {
          const count = stats?.by_category?.[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setFilterCategory(filterCategory === key ? '' : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                filterCategory === key
                  ? 'text-white'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-white/20'
              }`}
              style={filterCategory === key ? { borderColor: color, background: `${color}22`, color } : {}}
            >
              {icon} {label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索模板名称、场景、标签..."
            className="w-full pl-9 pr-4 py-2 bg-black/40 border border-[var(--border-color)] rounded text-sm"
          />
        </div>
        <select value={filterStyle} onChange={e => setFilterStyle(e.target.value)}
          className="bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm">
          <option value="">全部风格</option>
          {['科技蓝','赛博朋克','暗金','工业橙','全息投影','矩阵绿','告警红','极简白'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter3D} onChange={e => setFilter3D(e.target.value)}
          className="bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm">
          <option value="">是否含 3D</option>
          <option value="1">含 3D 孪生</option>
          <option value="0">无 3D</option>
        </select>
      </div>

      {/* ── Main Content ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <div>加载模板库...</div>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <TemplateGrid
          templates={filteredTemplates}
          onPreview={setPreviewTpl}
          onEdit={(tpl: any) => { setIsAdding(false); setEditingTpl(tpl); }}
          onDelete={handleDelete}
          onToggle={toggleEnable}
        />
      ) : (
        <TemplateTable
          templates={filteredTemplates}
          onPreview={setPreviewTpl}
          onEdit={(tpl: any) => { setIsAdding(false); setEditingTpl(tpl); }}
          onDelete={handleDelete}
          onToggle={toggleEnable}
        />
      )}

      {/* ── Edit Modal ── */}
      {editingTpl && (
        <EditModal
          tpl={editingTpl}
          isAdding={isAdding}
          onChange={setEditingTpl}
          onSave={handleSave}
          onClose={() => setEditingTpl(null)}
        />
      )}

      {/* ── Full-screen Preview Modal ── */}
      {previewTpl && (
        <PreviewModal tpl={previewTpl} onClose={() => setPreviewTpl(null)} />
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <TemplateImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            fetchTemplates();
            fetchStats();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────── Template Grid ─────────────────── */

function TemplateGrid({ templates, onPreview, onEdit, onDelete, onToggle }: any) {
  if (templates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <Cpu size={40} className="mx-auto mb-4 opacity-30" />
          <p>暂无模板，请运行初始化脚本或添加新模板。</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
        {templates.map((tpl: any) => (
          <TemplateCard key={tpl.template_id} tpl={tpl}
            onPreview={onPreview} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ tpl, onPreview, onEdit, onDelete, onToggle }: any) {
  const sc = getStyleColor(tpl.style);
  
  // Extract metadata from layout_config
  let subcategory = '';
  let tags: string[] = [];
  try {
    const cfg = JSON.parse(tpl.layout_config || '{}');
    subcategory = cfg.subcategory || '';
    tags = cfg.tags || [];
  } catch { /* ignore */ }

  return (
    <div
      className="group relative rounded-xl overflow-hidden border transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      style={{
        background: sc.bg,
        borderColor: tpl.is_enabled ? sc.border : 'rgba(100,116,139,0.2)',
        boxShadow: tpl.is_enabled ? `0 0 20px ${sc.border}` : 'none',
      }}
    >
      {/* Preview thumbnail */}
      <div
        className="relative overflow-hidden"
        style={{ height: 180 }}
        onClick={() => onPreview(tpl)}
      >
        <DashboardTemplatePreview
          style={tpl.style}
          category={tpl.category}
          scenario={tpl.scenario}
          name={tpl.name}
          has3d={tpl.has_3d === 1}
          subcategory={subcategory}
          tags={tags}
          fill={true}
          miniature={true}
          previewUrl={tpl.preview_url}
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex items-center gap-2 bg-black/60 px-4 py-2 rounded-full text-sm font-medium"
            style={{ color: sc.accent }}>
            <Eye size={16} /> 全屏预览
          </div>
        </div>
        {/* Disabled overlay */}
        {!tpl.is_enabled && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-gray-400 text-xs font-medium">已禁用</span>
          </div>
        )}
        {/* 3D badge */}
        {tpl.has_3d === 1 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-bold"
            style={{ background: `${sc.accent}22`, color: sc.accent, border: `1px solid ${sc.accent}66` }}>
            3D
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="p-3 border-t" style={{ borderColor: sc.border + '44' }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: sc.accent }}>{tpl.name}</h3>
            <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{tpl.template_id}</p>
          </div>
          <button
            onClick={() => onToggle(tpl)}
            className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              tpl.is_enabled
                ? 'border-green-500/50 bg-green-500/20 text-green-400'
                : 'border-gray-500/30 bg-gray-500/10 text-gray-500'
            }`}
          >
            {tpl.is_enabled ? <Check size={10} /> : <X size={10} />}
          </button>
        </div>
        {/* Tags */}
        <div className="flex gap-1 flex-wrap mb-3">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ background: `${sc.accent}18`, color: sc.accent }}>
            {tpl.style}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400">{tpl.scenario}</span>
          {tpl.category && <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400">{tpl.category}</span>}
        </div>
        {tpl.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-3">{tpl.description}</p>
        )}
        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onPreview(tpl)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-white/10"
            style={{ color: sc.accent }}
          >
            <Eye size={12} /> 预览
          </button>
          <button
            onClick={() => onEdit(tpl)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:bg-white/10 transition-colors"
          >
            <Edit size={12} /> 编辑
          </button>
          <button
            onClick={() => onDelete(tpl.template_id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Table View ─────────────────── */

function TemplateTable({ templates, onPreview, onEdit, onDelete, onToggle }: any) {
  return (
    <div className="flex-1 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden flex flex-col">
      <div className="overflow-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-sm text-[var(--text-secondary)]">
              <th className="p-4 font-medium">预览</th>
              <th className="p-4 font-medium">模板 ID</th>
              <th className="p-4 font-medium">名称</th>
              <th className="p-4 font-medium">风格 / 场景</th>
              <th className="p-4 font-medium">3D</th>
              <th className="p-4 font-medium">来源</th>
              <th className="p-4 font-medium">状态</th>
              <th className="p-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl: Template) => {
              const sc = getStyleColor(tpl.style);
              return (
                <tr key={tpl.template_id} className="border-b border-[var(--border-color)]/50 hover:bg-white/5 transition-colors">
                  <td className="p-3">
                    <div
                      className="w-24 h-16 rounded overflow-hidden cursor-pointer border hover:brightness-110 transition-all"
                      style={{ borderColor: sc.border }}
                      onClick={() => onPreview(tpl)}
                    >
                      <DashboardTemplatePreview
                        style={tpl.style} category={tpl.category} scenario={tpl.scenario}
                        name={tpl.name} has3d={tpl.has_3d === 1} fill={true} miniature={true} previewUrl={tpl.preview_url}
                      />
                    </div>
                  </td>
                  <td className="p-4 font-mono text-sm" style={{ color: sc.accent }}>{tpl.template_id}</td>
                  <td className="p-4 font-medium text-sm">{tpl.name}</td>
                  <td className="p-4">
                    <div className="flex gap-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-xs" style={{ background: `${sc.accent}18`, color: sc.accent }}>{tpl.style}</span>
                      <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded text-xs">{tpl.scenario}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    {tpl.has_3d === 1
                      ? <span className="text-emerald-400 font-bold text-sm">✓ 3D</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="p-4 text-xs text-gray-400">{tpl.source}</td>
                  <td className="p-4">
                    <button
                      onClick={() => onToggle(tpl)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                        tpl.is_enabled
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : 'border-gray-500/30 text-gray-400 bg-gray-500/10'
                      }`}
                    >
                      {tpl.is_enabled ? <Check size={10} /> : <X size={10} />}
                      {tpl.is_enabled ? '已启用' : '已禁用'}
                    </button>
                  </td>
                  <td className="p-4 flex gap-2 justify-end">
                    <button onClick={() => onPreview(tpl)} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: sc.accent }}><Eye size={15} /></button>
                    <button onClick={() => onEdit(tpl)} className="p-1.5 rounded hover:bg-white/10 text-gray-400 transition-colors"><Edit size={15} /></button>
                    <button onClick={() => onDelete(tpl.template_id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-[var(--text-secondary)]">暂无匹配模板</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────── Preview Modal ─────────────────── */

function PreviewModal({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
  const sc = getStyleColor(tpl.style);
  const catInfo = CATEGORY_LABELS[tpl.category] || { label: tpl.category, icon: '📋', color: '#64748B' };
  
  let subcategory = '';
  let tags: string[] = [];
  try {
    const cfg = JSON.parse(tpl.layout_config || '{}');
    subcategory = cfg.subcategory || '';
    tags = cfg.tags || [];
  } catch { /* ignore */ }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col z-[60]" onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Top bar */}
      <div className="shrink-0 px-6 py-3 flex items-center justify-between border-b"
        style={{ borderColor: sc.border, background: sc.bg }}>
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-8 rounded" style={{ background: sc.accent }} />
          <div>
            <h2 className="font-bold text-base" style={{ color: sc.accent }}>{tpl.name}</h2>
            <div className="flex gap-2 items-center mt-0.5 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{tpl.template_id}</span>
              <span className="text-gray-600">·</span>
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: `${catInfo.color}22`, color: catInfo.color, border: `1px solid ${catInfo.color}44` }}>
                {catInfo.icon} {catInfo.label}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${sc.accent}18`, color: sc.accent }}>{tpl.style}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{tpl.scenario}</span>
              {tpl.has_3d === 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">3D 孪生</span>}
              {tags.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500 max-w-xs truncate">{tpl.description}</p>
          <button
            onClick={onClose}
            className="p-2 rounded-full border transition-colors hover:bg-red-500/80 text-white border-white/20"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Preview area - fills remaining space */}
      <div className="flex-1 overflow-hidden" style={{ background: sc.bg }}>
        <DashboardTemplatePreview
          style={tpl.style}
          category={tpl.category}
          scenario={tpl.scenario}
          name={tpl.name}
          has3d={tpl.has_3d === 1}
          subcategory={subcategory}
          tags={tags}
          fill={true}
          previewUrl={tpl.preview_url}
        />
      </div>
    </div>
  );
}

/* ─────────────────── Edit Modal ─────────────────── */

function EditModal({ tpl, isAdding, onChange, onSave, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-white/5 rounded-t-xl">
          <h2 className="font-bold text-lg">{isAdding ? '新增模板' : '编辑模板'}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={onSave} className="p-6 flex flex-col gap-4 overflow-auto">
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">模板 ID</label>
              <input required disabled={!isAdding} value={tpl.template_id}
                onChange={e => onChange({ ...tpl, template_id: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm disabled:opacity-50 font-mono"
                placeholder="e.g. custom_wms_view" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">模板名称</label>
              <input required value={tpl.name}
                onChange={e => onChange({ ...tpl, name: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm"
                placeholder="e.g. WMS 总体视图" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">类别</label>
              <input required value={tpl.category}
                onChange={e => onChange({ ...tpl, category: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm"
                placeholder="e.g. WMS, RCS, AMHS" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">风格</label>
              <select value={tpl.style} onChange={e => onChange({ ...tpl, style: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm">
                {['科技蓝','赛博朋克','暗金','工业','全息','矩阵绿','告警红','极简'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">场景</label>
              <select value={tpl.scenario} onChange={e => onChange({ ...tpl, scenario: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm">
                {['RCS','仓储','工厂','物流','驾驶舱','能源','通用'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-[var(--text-secondary)]">来源</label>
              <input value={tpl.source} onChange={e => onChange({ ...tpl, source: e.target.value })}
                className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm" />
            </div>
            <div className="flex gap-4 items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={tpl.has_3d === 1}
                  onChange={e => onChange({ ...tpl, has_3d: e.target.checked ? 1 : 0 })} />
                <span className="text-sm text-[var(--accent-cyan)] font-medium">支持 3D 孪生</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={tpl.is_enabled === 1}
                  onChange={e => onChange({ ...tpl, is_enabled: e.target.checked ? 1 : 0 })} />
                <span className="text-sm">启用此模板</span>
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-[var(--text-secondary)]">描述</label>
            <input value={tpl.description} onChange={e => onChange({ ...tpl, description: e.target.value })}
              className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm"
              placeholder="描述此模板的用途..." />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-[var(--text-secondary)]">布局配置 (JSON)</label>
            <textarea required rows={6} value={tpl.layout_config}
              onChange={e => onChange({ ...tpl, layout_config: e.target.value })}
              className="w-full bg-black/40 border border-[var(--border-color)] rounded p-2 text-sm font-mono"
              placeholder='{"type":"grid","panels":[]}' />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm hover:bg-white/10">取消</button>
            <button type="submit" className="px-4 py-2 rounded text-sm bg-[var(--accent-cyan)] text-black font-medium hover:brightness-110">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
