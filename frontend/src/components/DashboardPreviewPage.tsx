import React, { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import 'echarts-gl';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { applyThemeToOption, detectHeroSpan } from './DashboardPanel';
import {
  isDashboardPreviewRoute,
  loadDashboardPreview,
  parsePreviewKey,
  type DashboardPreviewPayload,
} from './dashboardPreview';

export { isDashboardPreviewRoute, openDashboardPreviewTab } from './dashboardPreview';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function DashboardPreviewPage() {
  const key = useMemo(() => parsePreviewKey(), []);
  const [payload, setPayload] = useState<DashboardPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);
  const now = useClock();

  useEffect(() => {
    if (!key) {
      setError('缺少预览参数');
      return;
    }
    const data = loadDashboardPreview(key);
    if (!data || !Array.isArray(data.panels) || data.panels.length === 0) {
      setError('预览数据不存在或已过期，请回到原会话重新点击「新标签页」');
      return;
    }
    setPayload(data);
  }, [key]);

  useEffect(() => {
    const onFs = () => {
      setIsFs(!!document.fullscreenElement);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const timer = setTimeout(() => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
  }, [payload]);

  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm px-6 text-center">
        {error}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-cyan-300 text-sm">
        正在加载大屏...
      </div>
    );
  }

  const theme = payload.theme === 'light' ? 'light' : 'dark';
  const isDark = theme === 'dark';
  const n = payload.panels.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;

  // hero 面板（厂区地图等）跨 2x2；据此推算总行数与末行补格
  const spans = payload.panels.map((p) => {
    const span = detectHeroSpan(p.option, p.id);
    if (!span || cols < 2) return { col: 1, row: 1 };
    return { col: Math.min(span.col, cols), row: span.row };
  });
  const occupied = spans.reduce((acc, s) => acc + s.col * s.row, 0);
  const rows = Math.max(1, Math.ceil(occupied / cols));
  const leftover = Math.max(0, rows * cols - occupied);

  const headerH = 60;
  const rowH = `calc((100vh - ${headerH + 24}px - ${(rows - 1) * 12}px) / ${rows})`;

  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

  const btnStyle: React.CSSProperties = {
    borderColor: isDark ? 'rgba(34,211,238,0.35)' : 'rgba(8,145,178,0.35)',
    color: isDark ? '#22d3ee' : '#0891b2',
    background: isDark ? 'rgba(34,211,238,0.06)' : 'rgba(8,145,178,0.05)',
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        background: isDark
          ? 'radial-gradient(1100px 480px at 50% -8%, rgba(34,211,238,0.10), transparent 65%), radial-gradient(900px 420px at 88% 108%, rgba(59,130,246,0.08), transparent 60%), linear-gradient(180deg, #0a0f1e 0%, #0b1220 45%, #090d18 100%)'
          : '#f8fafc',
        color: isDark ? '#e2e8f0' : '#0f172a',
      }}
    >
      <header
        className="shrink-0 flex items-center justify-between px-5 relative"
        style={{
          height: headerH,
          borderBottom: `1px solid ${isDark ? 'rgba(34,211,238,0.18)' : 'rgba(15,23,42,0.08)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(11,18,32,0.75))'
            : 'rgba(255,255,255,0.92)',
        }}
      >
        {/* 页头底部霓虹光带 */}
        <div
          className="absolute bottom-[-1px] left-0 right-0 h-[2px] pointer-events-none"
          style={{
            background: isDark
              ? 'linear-gradient(90deg, transparent, rgba(34,211,238,0.7) 30%, rgba(59,130,246,0.55) 70%, transparent)'
              : 'linear-gradient(90deg, transparent, rgba(8,145,178,0.35) 50%, transparent)',
          }}
        />
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-2 h-8 rounded-full shrink-0"
            style={{ background: 'linear-gradient(180deg, #22d3ee, #3b82f6)' }}
          />
          <div className="min-w-0">
            <div
              className="text-lg font-bold tracking-widest truncate"
              style={
                isDark
                  ? {
                      backgroundImage: 'linear-gradient(90deg, #67e8f9, #22d3ee 40%, #60a5fa)',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent',
                      textShadow: '0 0 24px rgba(34,211,238,0.25)',
                    }
                  : { color: '#0891b2' }
              }
            >
              {payload.title || '工业监控大屏'}
            </div>
            <div className="text-[11px] opacity-60 tracking-wide">
              {n} 个独立面板 · 实时刷新 · SIDEA 智能体生成
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-1">
            <span className="text-base font-mono font-semibold" style={{ color: isDark ? '#67e8f9' : '#0891b2' }}>
              {timeStr}
            </span>
            <span className="text-[11px] opacity-55">{dateStr}</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-opacity hover:opacity-80"
            style={btnStyle}
          >
            <RefreshCw size={14} />
            刷新页面
          </button>
          <button
            type="button"
            onClick={toggleFs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-opacity hover:opacity-80"
            style={btnStyle}
          >
            {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFs ? '退出全屏' : '进入全屏'}
          </button>
        </div>
      </header>

      <div
        className="flex-1 min-h-0 p-3 grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {payload.panels.map((panel, idx) => {
          let spanCol = spans[idx].col;
          const spanRow = spans[idx].row;
          if (idx === n - 1 && spanCol === 1 && spanRow === 1 && leftover > 0) {
            spanCol = 1 + leftover;
          }
          const chartH =
            spanRow > 1 ? `calc(${rowH} * ${spanRow} + ${(spanRow - 1) * 12}px)` : rowH;
          return (
            <div
              key={panel.id || idx}
              className="min-w-0 min-h-0 rounded-xl overflow-hidden relative"
              style={{
                border: `1px solid ${isDark ? 'rgba(34,211,238,0.16)' : 'rgba(15,23,42,0.1)'}`,
                background: isDark
                  ? 'linear-gradient(180deg, rgba(23,32,52,0.82) 0%, rgba(13,19,33,0.92) 100%)'
                  : '#fff',
                gridColumn: spanCol > 1 ? `span ${spanCol}` : undefined,
                gridRow: spanRow > 1 ? `span ${spanRow}` : undefined,
                boxShadow: isDark
                  ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 30px rgba(2,8,20,0.45)'
                  : '0 1px 2px rgba(15,23,42,0.04)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-10"
                style={{
                  background: isDark
                    ? 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55) 30%, rgba(59,130,246,0.45) 70%, transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(8,145,178,0.35) 50%, transparent)',
                }}
              />
              <ReactECharts
                option={applyThemeToOption(panel.option, theme)}
                style={{ height: chartH, width: '100%' }}
                theme={theme}
                notMerge
                lazyUpdate
                opts={{ renderer: 'canvas' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
