import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { DashboardPanelItem } from './DashboardPanel';
import { DashboardChart, resolveLangKey } from './DashboardPanel';
import { useAppStore } from '../store';
import { Amr3DMapWidget } from '../dashboard/widgets/Amr3DMap';
import { Dropdown, message, Spin } from 'antd';
import type { MenuProps } from 'antd';
import { resolveWidget } from '../dashboard/registry';
import { 
  Download, 
  ExternalLink, 
  FileImage, 
  FileText, 
  Maximize2, 
  Minimize2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Box,
  LayoutGrid
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { openDashboardPreviewTab } from './dashboardPreview';
import { simplifiedToTraditional } from './langUtils';

// Internal Collapsible & Draggable Sci-Fi Frame component for HUD look
const SciFiFrame = ({ 
  children, 
  title, 
  enableAnimations, 
  frameCss,
  panelId,
  theme = 'dark',
  onDragStart,
  onDragOver,
  onDrop,
}: { 
  children: React.ReactNode; 
  title?: string; 
  enableAnimations?: boolean; 
  frameCss?: React.CSSProperties;
  panelId?: string;
  theme?: string;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPanelFs, setIsPanelFs] = useState(false);
  const isDark = theme === 'dark';
  const accent = isDark ? (frameCss?.borderColor || 'var(--accent-cyan)') : '#0891b2';

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
      return next;
    });
  }, []);

  const handleToggleFs = useCallback(() => {
    setIsPanelFs((prev) => {
      const next = !prev;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
      return next;
    });
  }, []);

  const computedFrameStyle: React.CSSProperties = {
    background: isDark
      ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(8, 47, 73, 0.7) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(241, 245, 249, 0.95) 100%)',
    borderColor: isDark ? 'rgba(34, 211, 238, 0.25)' : 'rgba(8, 145, 178, 0.25)',
    boxShadow: isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.4)' : '0 8px 32px 0 rgba(8, 145, 178, 0.12)',
    color: isDark ? '#e2e8f0' : '#0f172a',
    ...frameCss,
    ...(isPanelFs
      ? {
          position: 'fixed',
          top: '16px',
          left: '16px',
          right: '16px',
          bottom: '16px',
          zIndex: 99999,
          background: isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
        }
      : {}),
  };

  const frameContent = (
    <div 
      draggable={!isPanelFs && !!onDragStart && !!panelId}
      onDragStart={(e) => !isPanelFs && panelId && onDragStart && onDragStart(e, panelId)}
      onDragOver={!isPanelFs ? onDragOver : undefined}
      onDrop={(e) => !isPanelFs && panelId && onDrop && onDrop(e, panelId)}
      className={`scifi-panel transition-all duration-300 flex flex-col relative group ${
        isPanelFs 
          ? 'fixed inset-4 z-[99999] border-2 shadow-2xl rounded-2xl p-5 border-cyan-500 flex flex-col' 
          : isCollapsed 
            ? 'w-full h-auto min-h-[44px] p-3 border rounded-xl' 
            : 'w-full h-full min-h-0 p-3 border rounded-xl'
      }`}
      style={computedFrameStyle}
    >
      {/* Frame corners */}
      <div className="corner-tr" style={{ borderColor: accent }} />
      <div className="corner-bl" style={{ borderColor: accent }} />
      
      {/* Interactive Header Bar */}
      <div className={`flex items-center justify-between gap-2 px-1 py-1 mb-1.5 border-b shrink-0 select-none ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2 min-w-0 cursor-grab active:cursor-grabbing">
          {panelId && !isPanelFs && (
            <GripVertical size={14} className={`${isDark ? 'text-slate-400' : 'text-slate-500'} opacity-40 group-hover:opacity-100 transition-opacity shrink-0`} />
          )}
          <div className="w-1.5 h-3.5 rounded-full shrink-0" style={{ background: accent }} />
          {title && (
            <span className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: accent }}>
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleToggleFs}
            className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-200/80 text-slate-600'}`}
            title={isPanelFs ? "退出放大" : "放大图表面板"}
          >
            {isPanelFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {!isPanelFs && (
            <button
              type="button"
              onClick={handleToggleCollapse}
              className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-200/80 text-slate-600'}`}
              title={isCollapsed ? "展开面板" : "收起面板"}
            >
              {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
        </div>
      </div>
      
      {/* Body content — Keep mounted with height collapse so ECharts layout is never destroyed */}
      <div 
        className={`flex-1 relative z-10 overflow-hidden min-h-0 w-full transition-all duration-300 ${
          isCollapsed && !isPanelFs ? 'h-0 max-h-0 opacity-0 pointer-events-none' : 'h-full flex flex-col opacity-100'
        }`}
      >
        {children}
      </div>
      
      {(!isCollapsed || isPanelFs) && enableAnimations && isDark && <div className="animate-scanline" />}
    </div>
  );

  if (isPanelFs && typeof document !== 'undefined') {
    return createPortal(frameContent, document.body);
  }

  return frameContent;
};

interface TemplatedDashboardProps {
  title?: string;
  panels: DashboardPanelItem[];
  theme: string;
  templateId: string;
  language?: string;
  model3d_url?: string;
  dsl?: any;
}

export function TemplatedDashboard({
  title,
  panels,
  theme,
  templateId,
  language,
  model3d_url,
  dsl
}: TemplatedDashboardProps) {
  const { i18n } = useTranslation();
  const { language: storeLang, enableAnimations } = useAppStore();
  const activeLang = language || storeLang || i18n.language;

  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [customLayoutMode, setCustomLayoutMode] = useState<'3d' | 'grid' | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const isDark = theme === 'dark';

  const toggleLeftSidebar = useCallback(() => {
    setLeftCollapsed((prev) => {
      const next = !prev;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
      return next;
    });
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightCollapsed((prev) => {
      const next = !prev;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
      return next;
    });
  }, []);

  const overlayRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const isZh = resolveLangKey(activeLang) === 'zh-CN';
  const isTrad = /繁|zh-tw|zh-hk|zh-hant/i.test(activeLang || '');
  const L = (zh: string, en: string) => {
    if (!isZh) return en;
    return isTrad ? simplifiedToTraditional(zh) : zh;
  };
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  const enterFullscreen = useCallback(() => {
    flushSync(() => setIsFullscreen(true));
    const el = overlayRef.current;
    if (el && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(false);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen((cur) => {
          if (cur) setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
          return false;
        });
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  const exportPng = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: isDark ? '#0b1220' : '#f8fafc',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `SIDEA_Template_${stamp()}.png`;
      a.click();
      message.success(L('已导出高清 PNG', 'PNG exported'));
    } catch (e: any) {
      message.error(e?.message || 'PNG export failed');
    }
  }, [isDark, L]);

  const exportPdf = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2.5,
        cacheBust: true,
        backgroundColor: isDark ? '#0b1220' : '#f8fafc',
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = dataUrl;
      });
      const pdf = new jsPDF({
        orientation: img.width >= img.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [img.width, img.height],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
      pdf.save(`SIDEA_Template_${stamp()}.pdf`);
      message.success(L('已导出 PDF', 'PDF exported'));
    } catch (e: any) {
      message.error(e?.message || 'PDF export failed');
    }
  }, [isDark, L]);

  const openNewTab = useCallback(() => {
    try {
      openDashboardPreviewTab({
        title,
        theme,
        dsl,
        language: activeLang,
        panels,
        template: templateId,
      });
    } catch {
      message.error(L('新标签页被浏览器拦截，请允许本站打开标签页后重试', 'Popup blocked'));
    }
  }, [title, theme, dsl, activeLang, panels, templateId, L]);

  const exportMenu: MenuProps['items'] = [
    {
      key: 'png',
      icon: <FileImage size={14} />,
      label: L('导出高清图片 PNG', 'Export HD PNG'),
      onClick: () => exportPng(),
    },
    {
      key: 'pdf',
      icon: <FileText size={14} />,
      label: L('导出 PDF', 'Export PDF'),
      onClick: () => exportPdf(),
    },
  ];

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);

    const legacyMap: Record<string, string> = {
      amr_command_center: 'tpl_custom_agv_977581',
      gen_deep_beta: 'tpl_custom_agv_977581',
      twin_center: 'tpl_ext_erack_4deab6',
      gen_cyberpunk_alpha: 'tpl_ext_erack_4deab6',
      industrial_4panel: 'tpl_custom_chassis_57f363',
      gen_industrial_dark: 'tpl_custom_chassis_57f363',
      freeform_grid: 'tpl_custom_general_102de1',
      gen_glassmorphic_light: 'tpl_custom_general_102de1',
    };
    const finalTemplateId = legacyMap[templateId] || templateId;

    fetch(`http://localhost:8000/api/templates/${finalTemplateId}`)
      .then(res => {
        if (!res.ok) throw new Error('Template not found');
        return res.json();
      })
      .then(data => {
        let parsed = {};
        try { parsed = JSON.parse(data.layout_config); } catch(e) {}
        setConfig(parsed);
      })
      .catch(err => {
        console.error("Failed to load template", err);
        setConfig({ layout: 'twin_center', bg_css: '#111' });
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  const mergedConfig = useMemo(() => {
    const base = config || {};
    const override = dsl?.theme_override || {};
    return { ...override, ...base };
  }, [config, dsl]);

  const [panelItems, setPanelItems] = useState<any[]>([]);
  useEffect(() => {
    const src = (dsl ? dsl.layout : panels) || [];
    const normalized = src.map((item: any, idx: number) => ({
      ...item,
      _uniqueId: item.id ? `${item.id}_${idx}` : `panel_${idx}_${item.widget || 'chart'}`,
    }));
    setPanelItems(normalized);
  }, [dsl, panels]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedPanelId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedPanelId || draggedPanelId === targetId) return;
    setPanelItems((prev) => {
      const copy = [...prev];
      const fromIdx = copy.findIndex((p) => p._uniqueId === draggedPanelId);
      const toIdx = copy.findIndex((p) => p._uniqueId === targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
      }
      return copy;
    });
    setDraggedPanelId(null);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
  }, [draggedPanelId]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center"><Spin size="large" /></div>;
  }

  const effectiveLayout = customLayoutMode === '3d' ? 'twin_center' : customLayoutMode === 'grid' ? '2x2' : (mergedConfig?.layout || dsl?.template_layout || 'twin_center');
  const accentColor = isDark ? (mergedConfig?.accent_color || 'var(--accent-cyan)') : '#0891b2';
  
  const defaultBg = isDark
    ? 'linear-gradient(135deg, #0b1220 0%, #090d16 50%, #0f172a 100%)'
    : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f1f5f9 100%)';

  const bgStyle = {
    background: isDark ? (mergedConfig?.bg_css || defaultBg) : defaultBg,
    color: isDark ? '#f8fafc' : '#0f172a',
  };
  const frameStyle = parseCss(mergedConfig?.frame_css || '');
  const headerStyle = parseCss(mergedConfig?.header_css || '');

  function parseCss(cssStr: string) {
    if (!cssStr) return {};
    const rules = cssStr.split(';').filter(s => s.trim());
    const obj: any = {};
    for (let r of rules) {
      const [k, ...v] = r.split(':');
      if (k && v.length) {
        const camelK = k.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
        obj[camelK] = v.join(':').trim();
      }
    }
    return obj;
  }

  const renderHeader = () => {
    if (!title) return null;
    return (
      <div className="py-4 mb-4 relative z-20" style={{...headerStyle, borderBottom: headerStyle.borderBottom || `2px solid ${isDark ? accentColor : '#0891b2'}`}}>
        <h1 className="text-2xl font-bold text-center tracking-[0.2em] uppercase" style={{ color: isDark ? (headerStyle.color || 'white') : '#0f172a', textShadow: isDark ? (headerStyle.textShadow || `0 0 10px ${accentColor}`) : '0 0 10px rgba(8, 145, 178, 0.2)' }}>
          {title}
        </h1>
      </div>
    );
  };

  const renderToolbar = (fullscreen: boolean) => (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b shrink-0 select-none"
      style={{
        borderColor: isDark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)',
        background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.85)',
      }}
    >
      <div className="min-w-0 flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          LIVE • {L('系统连线', 'ACTIVE')}
        </div>
        <div>
          <div
            className={`font-bold tracking-wide truncate ${fullscreen ? 'text-lg' : 'text-sm'}`}
            style={{ color: accentColor }}
          >
            {title || L('预设模版大屏', 'Templated Dashboard')}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
            {L(
              `Template ID: ${templateId}`,
              `Template ID: ${templateId}`
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <div className={`flex items-center p-0.5 rounded-lg border text-xs mr-2 ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-100 border-slate-300'}`}>
          <button
            type="button"
            onClick={() => setCustomLayoutMode('3d')}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              effectiveLayout === 'twin_center' || effectiveLayout === '1_center_2_sides'
                ? isDark ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'bg-cyan-600/20 text-cyan-800 font-bold border border-cyan-600/40'
                : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="3D 数字孪生 Hero 模式"
          >
            <Box size={13} />
            3D 孪生
          </button>
          <button
            type="button"
            onClick={() => setCustomLayoutMode('grid')}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              effectiveLayout !== 'twin_center' && effectiveLayout !== '1_center_2_sides'
                ? isDark ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'bg-cyan-600/20 text-cyan-800 font-bold border border-cyan-600/40'
                : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="网格平铺模式"
          >
            <LayoutGrid size={13} />
            网格平铺
          </button>
        </div>

        <button
          type="button"
          onClick={fullscreen ? exitFullscreen : enterFullscreen}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: isDark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)', color: accentColor }}
          title={L('大屏全屏', 'Fullscreen dashboard')}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {fullscreen ? L('退出全屏', 'Exit') : L('全屏', 'Fullscreen')}
        </button>
        <button
          type="button"
          onClick={openNewTab}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: isDark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)', color: accentColor }}
          title={L('在新标签页打开并全屏', 'Open fullscreen in new tab')}
        >
          <ExternalLink size={14} />
          {L('新标签页', 'New Tab')}
        </button>
        <Dropdown menu={{ items: exportMenu }} placement="bottomRight" trigger={['click']}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
            style={{ borderColor: isDark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)', color: accentColor }}
          >
            <Download size={14} />
            {L('导出', 'Export')}
          </button>
        </Dropdown>
      </div>
    </div>
  );

  const renderPanelContent = (panel: any) => {
    if (dsl && panel.widget) {
      const Comp = resolveWidget(panel.widget);
      const data = dsl.data?.[panel.data_ref];
      return (
        <div className="h-full w-full">
          <Comp item={panel} data={data} theme={theme} language={activeLang} height="100%" title={panel.title} />
        </div>
      );
    }
    return <DashboardChart option={panel.option} theme={theme} height="100%" />;
  };

  const renderDashboardBody = (isFs: boolean) => {
    if (effectiveLayout === 'twin_center' || effectiveLayout === '1_center_2_sides') {
      const isChromeWidget = (w: string, id: string) => {
        return (
          w === 'dashboard_header' ||
          w === 'kpi_header' ||
          w === 'kpi_strip' ||
          w === 'header' ||
          w === 'amr_iso_map' ||
          w === 'amr_floor_map' ||
          id === 'hdr' ||
          id === 'header' ||
          id === 'kpis' ||
          id === 'floor'
        );
      };

      const isContentPanel = (p: any) => {
        if (!p) return false;
        const w = p.widget || '';
        const id = p.id || '';
        return !isChromeWidget(w, id);
      };

      let sidePanels = panelItems.filter(isContentPanel).slice(0, 4);
      if (sidePanels.length < 4) {
        sidePanels = panelItems.filter(p => p?.widget !== 'dashboard_header' && p?.widget !== 'amr_iso_map' && p?.id !== 'hdr' && p?.id !== 'floor').slice(0, 4);
      }

      const sidebarBtnClass = isDark
        ? "border-cyan-500/30 bg-slate-900/80 text-cyan-400 hover:bg-cyan-500/20"
        : "border-cyan-600/30 bg-white/90 text-cyan-700 hover:bg-cyan-50 shadow-sm";

      return (
        <div className={`w-full ${isFs ? 'h-full flex-1' : 'h-[750px]'} flex flex-col p-4 font-mono relative overflow-hidden`} style={bgStyle}>
          {/* Full-screen 3D Interactive Canvas Background */}
          <div className="absolute inset-0 z-0">
            <Amr3DMapWidget 
              item={{ id: 'amr_iso_map', widget: 'amr_iso_map', title: '数字孪生 3D 实时监控' } as any} 
              data={(dsl ? {...(dsl.data?.[panelItems.find(p => p.id === 'amr_iso_map')?.data_ref] || {}), model3d_url} : { model3d_url }) as any} 
              theme={theme} 
              language={activeLang} 
              height="100%" 
            />
          </div>
          
          {/* Floating Sci-Fi HUD Sidebars */}
          <div className="relative z-10 flex flex-col h-full pointer-events-none">
            <div className="pointer-events-auto">
              {renderHeader()}
            </div>
            <div className="flex justify-between flex-1 min-h-0 gap-4">
              {/* Left side floating HUD panels */}
              <div className={`transition-all duration-300 flex flex-col gap-3 pointer-events-auto h-full overflow-y-auto pb-4 custom-scrollbar ${
                leftCollapsed ? 'w-[42px]' : 'w-[300px] xl:w-[360px]'
              }`}>
                <button
                  type="button"
                  onClick={toggleLeftSidebar}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono transition-colors shrink-0 ${sidebarBtnClass}`}
                  title={leftCollapsed ? "展开左侧栏" : "收起左侧栏"}
                >
                  {leftCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                  {!leftCollapsed && <span>{L('收起左栏', 'Collapse Left')}</span>}
                </button>

                {!leftCollapsed && sidePanels.slice(0, 2).map((panel: any, idx: number) => {
                  const pId = panel._uniqueId || panel.id || `l_${idx}`;
                  const pTitle = panel.title || panel.name || `监控指标 ${idx + 1}`;
                  return (
                    <div key={pId} className="flex-1 rounded-lg min-h-[220px]">
                      <SciFiFrame 
                        title={pTitle} 
                        enableAnimations={enableAnimations} 
                        frameCss={frameStyle}
                        panelId={pId}
                        theme={theme}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      >
                        {renderPanelContent(panel)}
                      </SciFiFrame>
                    </div>
                  );
                })}
              </div>
              
              {/* Center interactive 3D area pass-through */}
              <div className="flex-1 pointer-events-none"></div>
              
              {/* Right side floating HUD panels */}
              <div className={`transition-all duration-300 flex flex-col gap-3 pointer-events-auto h-full overflow-y-auto pb-4 custom-scrollbar ${
                rightCollapsed ? 'w-[42px]' : 'w-[300px] xl:w-[360px]'
              }`}>
                <button
                  type="button"
                  onClick={toggleRightSidebar}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono transition-colors shrink-0 ${sidebarBtnClass}`}
                  title={rightCollapsed ? "展开右侧栏" : "收起右侧栏"}
                >
                  {!rightCollapsed && <span>{L('收起右栏', 'Collapse Right')}</span>}
                  {rightCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>

                {!rightCollapsed && sidePanels.slice(2, 4).map((panel: any, idx: number) => {
                  const pId = panel._uniqueId || panel.id || `r_${idx}`;
                  const pTitle = panel.title || panel.name || `分析数据 ${idx + 3}`;
                  return (
                    <div key={pId} className="flex-1 rounded-lg min-h-[220px]">
                      <SciFiFrame 
                        title={pTitle} 
                        enableAnimations={enableAnimations} 
                        frameCss={frameStyle}
                        panelId={pId}
                        theme={theme}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      >
                        {renderPanelContent(panel)}
                      </SciFiFrame>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Grid Layout (2x2, 3x3)
    const is3x3 = effectiveLayout === '3x3';
    const gridClass = is3x3 ? "grid-cols-3 grid-rows-3" : "grid-cols-2 grid-rows-2";
    const sliceCount = is3x3 ? 9 : 4;

    const isChromeWidget = (w: string, id: string) => {
      return (
        w === 'dashboard_header' ||
        w === 'kpi_header' ||
        w === 'kpi_strip' ||
        w === 'header' ||
        w === 'amr_iso_map' ||
        w === 'amr_floor_map' ||
        id === 'hdr' ||
        id === 'header' ||
        id === 'kpis' ||
        id === 'floor'
      );
    };

    const isContentPanel = (p: any) => {
      if (!p) return false;
      const w = p.widget || '';
      const id = p.id || '';
      return !isChromeWidget(w, id);
    };

    let gridPanels = panelItems.filter(isContentPanel).slice(0, sliceCount);
    if (gridPanels.length < sliceCount) {
      gridPanels = panelItems.filter(p => p?.widget !== 'dashboard_header' && p?.widget !== 'amr_iso_map' && p?.id !== 'hdr' && p?.id !== 'floor').slice(0, sliceCount);
    }

    return (
      <div className={`w-full ${isFs ? 'h-full flex-1' : 'min-h-[600px] h-[750px]'} flex flex-col gap-4 p-4 text-white font-mono relative overflow-auto`} style={bgStyle}>
        {renderHeader()}
        <div className={`grid ${gridClass} gap-6 flex-1 min-h-[500px]`}>
          {gridPanels.map((panel: any, idx: number) => {
            const pId = panel._uniqueId || panel.id || `g_${idx}`;
            const pTitle = panel.title || panel.name || `图表面板 ${idx + 1}`;
            return (
              <div key={pId} className="h-full min-h-0">
                <SciFiFrame 
                  title={pTitle} 
                  enableAnimations={enableAnimations} 
                  frameCss={frameStyle}
                  panelId={pId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {renderPanelContent(panel)}
                </SciFiFrame>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const fullscreenOverlay = isFullscreen && typeof document !== 'undefined'
    ? createPortal(
        <div ref={overlayRef} className="fixed inset-0 z-[2000] flex flex-col" style={{ background: theme === 'dark' ? '#0b1220' : '#f8fafc' }}>
          {renderToolbar(true)}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderDashboardBody(true)}</div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="w-full my-4 rounded-2xl border shadow-sm flex flex-col overflow-hidden" style={{ borderColor: theme === 'dark' ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)' }}>
        <div className="rounded-2xl overflow-hidden flex-col flex w-full">
          {renderToolbar(false)}
          <div ref={captureRef} className="w-full relative shrink-0">
            {renderDashboardBody(false)}
          </div>
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
}

