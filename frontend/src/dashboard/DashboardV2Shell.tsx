import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileImage,
  FileText,
  Maximize2,
  MessageSquareCode,
  Minimize2,
  Table2,
} from 'lucide-react';
import { Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { openDashboardPreviewTab } from '../components/dashboardPreview';
import { resolveLangKey } from '../components/DashboardPanel';
import { simplifiedToTraditional } from '../components/langUtils';
import { DashboardV2 } from './DashboardV2';
import type { DashboardDslV2 } from './types';

type Props = {
  doc: DashboardDslV2;
  theme: string;
  language: string;
  sourceCode?: string;
};

function themeTokens(theme: string) {
  const dark = theme === 'dark';
  return {
    border: dark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)',
    accent: dark ? '#22d3ee' : '#0891b2',
    muted: dark ? '#94a3b8' : '#64748b',
    text: dark ? '#e2e8f0' : '#0f172a',
    shellBg: dark ? '#0b1220' : '#f8fafc',
  };
}

function downloadText(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildDslReplayPrompt(doc: DashboardDslV2, language: string): string {
  const isZh = resolveLangKey(language) === 'zh-CN';
  const widgets = (doc.layout || []).map((x, i) => `${i + 1}. ${x.widget} (${x.id})`);
  if (isZh) {
    return [
      `请重新生成 DSL v2 大屏「${doc.title || '工业监控大屏'}」。`,
      '要求：',
      '- dsl_version=2，英雄位优先 amr_iso_map',
      '- layout 每个 data_ref 必须在 data 中存在',
      '- 最终输出 ```echarts-i18n``` 的 JSON URL',
      'Widget 清单：',
      ...widgets,
    ].join('\n');
  }
  return [
    `Regenerate DSL v2 dashboard "${doc.title || 'Industrial Dashboard'}".`,
    'Use amr_iso_map hero, valid data_ref bindings, export echarts-i18n URL.',
    'Widgets:',
    ...widgets,
  ].join('\n');
}

/** DSL v2 大屏外壳：与 legacy DashboardGrid 一致的工具栏（全屏 / 新标签页 / 导出 / 复制） */
export function DashboardV2Shell({ doc, theme, language, sourceCode }: Props) {
  const { i18n } = useTranslation();
  const { language: storeLang } = useAppStore();
  const activeLang = language || storeLang || i18n.language;
  const tokens = themeTokens(theme);
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
  const widgetCount = doc.layout?.length || 0;
  const src = sourceCode || JSON.stringify(doc, null, 2);

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

  const copyText = useCallback(async (text: string, okMsg: string) => {
    await navigator.clipboard.writeText(text);
    message.success(okMsg);
  }, []);

  const exportPng = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: theme === 'dark' ? '#0b1220' : '#f8fafc',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `SIDEA_Dashboard_${stamp()}.png`;
      a.click();
      message.success(L('已导出高清 PNG', 'PNG exported'));
    } catch (e: any) {
      message.error(e?.message || 'PNG export failed');
    }
  }, [theme, L]);

  const exportPdf = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2.5,
        cacheBust: true,
        backgroundColor: theme === 'dark' ? '#0b1220' : '#f8fafc',
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
      pdf.save(`SIDEA_Dashboard_${stamp()}.pdf`);
      message.success(L('已导出 PDF', 'PDF exported'));
    } catch (e: any) {
      message.error(e?.message || 'PDF export failed');
    }
  }, [theme, L]);

  const openNewTab = useCallback(() => {
    try {
      openDashboardPreviewTab({
        title: doc.title,
        theme,
        dsl: doc,
        language: activeLang,
        panels: [],
      });
    } catch {
      message.error(L('新标签页被浏览器拦截，请允许本站打开标签页后重试', 'Popup blocked'));
    }
  }, [doc, theme, activeLang, L]);

  const exportMenu: MenuProps['items'] = [
    {
      key: 'prompt',
      icon: <MessageSquareCode size={14} />,
      label: L('导出提示词', 'Export Prompt'),
      onClick: () => {
        const prompt = buildDslReplayPrompt(doc, activeLang);
        downloadText(`SIDEA_Dashboard_Prompt_${stamp()}.md`, prompt, 'text/markdown');
        copyText(prompt, L('提示词已复制并下载', 'Prompt copied & downloaded'));
      },
    },
    {
      key: 'data',
      icon: <Table2 size={14} />,
      label: L('导出数据 JSON', 'Export Data JSON'),
      onClick: () => {
        downloadText(`SIDEA_Dashboard_Data_${stamp()}.json`, JSON.stringify(doc.data || {}, null, 2));
        message.success(L('数据已导出', 'Data exported'));
      },
    },
    {
      key: 'source',
      icon: <FileCode size={14} />,
      label: L('导出源码 JSON', 'Export Source JSON'),
      onClick: () => {
        downloadText(`SIDEA_Dashboard_Source_${stamp()}.json`, src);
        copyText(src, L('源码已复制并下载', 'Source copied & downloaded'));
      },
    },
    { type: 'divider' },
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

  const renderToolbar = (fullscreen: boolean) => (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
      style={{
        borderColor: tokens.border,
        background: theme === 'dark' ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.75)',
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
            style={{ color: tokens.accent }}
          >
            {doc.title || L('工业监控大屏', 'Industrial Dashboard')}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: tokens.muted }}>
            {L(
              `DSL v2 · ${widgetCount} widgets · Pixi/ECharts 引擎`,
              `DSL v2 · ${widgetCount} widgets · Pixi/ECharts engine`
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button
          type="button"
          onClick={fullscreen ? exitFullscreen : enterFullscreen}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: tokens.border, color: tokens.accent }}
          title={L('大屏全屏', 'Fullscreen dashboard')}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {fullscreen ? L('退出全屏', 'Exit') : L('全屏', 'Fullscreen')}
        </button>
        <button
          type="button"
          onClick={openNewTab}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: tokens.border, color: tokens.accent }}
          title={L('在新标签页打开并全屏', 'Open fullscreen in new tab')}
        >
          <ExternalLink size={14} />
          {L('新标签页', 'New Tab')}
        </button>
        <Dropdown menu={{ items: exportMenu }} placement="bottomRight" trigger={['click']}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
            style={{ borderColor: tokens.border, color: tokens.accent }}
          >
            <Download size={14} />
            {L('导出', 'Export')}
          </button>
        </Dropdown>
        <button
          type="button"
          onClick={() => copyText(src, L('已复制源码', 'Source copied'))}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: tokens.border, color: tokens.muted }}
          title={L('复制源码', 'Copy source')}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  );

  const renderBody = (fullscreen: boolean) => (
    <div ref={fullscreen ? undefined : captureRef} className={fullscreen ? 'h-full' : ''}>
      <DashboardV2 doc={doc} theme={theme} language={activeLang} fullscreen={fullscreen} embedded />
    </div>
  );

  const fullscreenOverlay =
    isFullscreen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-[2000] flex flex-col"
            style={{
              background: theme === 'dark' ? '#0b1220' : '#f8fafc',
              color: tokens.text,
            }}
          >
            {renderToolbar(true)}
            <div className="flex-1 min-h-0 overflow-auto">{renderBody(true)}</div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className="w-full my-4 rounded-2xl border shadow-sm"
        style={{
          background: tokens.shellBg,
          borderColor: tokens.border,
          color: tokens.text,
          overflow: 'visible',
        }}
      >
        <div className="rounded-2xl overflow-hidden" style={{ borderRadius: 'inherit' }}>
          {renderToolbar(false)}
          {renderBody(false)}
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
}
