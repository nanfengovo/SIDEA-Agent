import { useMemo } from 'react';
import type { DashboardDslV2, LayoutItem } from './types';
import { resolveWidget } from './registry';
import { applyI18n, pickI18nDict, resolveLangKey } from '../components/DashboardPanel';

function localizeTitle(item: LayoutItem, language: string, dict: Record<string, string>): string | undefined {
  const isZh = resolveLangKey(language) === 'zh-CN';
  const raw = isZh ? item.title : item.title_en || item.title;
  if (!raw) return undefined;
  const applied = applyI18n(raw, dict);
  return typeof applied === 'string' ? applied : String(raw);
}

type Props = {
  doc: DashboardDslV2;
  theme: string;
  language: string;
  fullscreen?: boolean;
  /** Render inside outer shell toolbar; hide duplicated chrome/title/insights */
  embedded?: boolean;
};

function panelCols(n: number, fullscreen: boolean): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return fullscreen ? 4 : 3;
}

/** Named template layouts: amr_command_center stacks header+kpi then hero grid. */
function useOrderedLayout(doc: DashboardDslV2): LayoutItem[] {
  return useMemo(() => {
    if (doc.template !== 'tpl_cockpit_ceo_1') return doc.layout;
    const order = ['top', 'kpi', 'hero', 'right1', 'right2', 'bottom'];
    const bySlot = new Map(doc.layout.map((x) => [x.slot || x.id, x]));
    const ordered: LayoutItem[] = [];
    for (const s of order) {
      const hit = bySlot.get(s);
      if (hit) ordered.push(hit);
    }
    // append leftovers
    for (const item of doc.layout) {
      if (!ordered.includes(item)) ordered.push(item);
    }
    return ordered.length ? ordered : doc.layout;
  }, [doc]);
}

export function DashboardV2({ doc, theme, language, fullscreen = false, embedded = false }: Props) {
  const dict = pickI18nDict(doc.i18n, language);
  const title = useMemo(() => {
    const t = applyI18n(doc.title, dict);
    return typeof t === 'string' ? t : String(doc.title || '');
  }, [doc.title, dict]);
  const layout = useOrderedLayout(doc);
  const dark = theme === 'dark';

  // Split chrome widgets (header / kpi full-width) from grid widgets
  const chrome = layout.filter((x) => x.widget === 'dashboard_header' || x.widget === 'kpi_strip');
  const gridItems = layout.filter((x) => x.widget !== 'dashboard_header' && x.widget !== 'kpi_strip');

  const n = gridItems.length;
  const cols = panelCols(Math.max(n, 1), fullscreen);
  const heroExtra = gridItems.reduce((acc, p) => {
    if (!p.span || cols < 2) return acc;
    return acc + (Math.min(p.span.col, cols) * (p.span.row || 1) - 1);
  }, 0);
  const rows = Math.max(1, Math.ceil((n + heroExtra) / cols));
  const chatRowH = 280;

  return (
    <div
      className={`w-full flex flex-col gap-3 ${embedded ? 'p-2 md:p-3' : 'p-3 md:p-4 rounded-xl border'} ${fullscreen ? 'h-full' : ''}`}
      style={{
        borderColor: embedded ? 'transparent' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'),
        background: dark
          ? (embedded
              ? 'transparent'
              : 'radial-gradient(900px 420px at 50% -10%, rgba(34,211,238,0.08), transparent 60%), #0b1220')
          : (embedded ? 'transparent' : '#f8fafc'),
      }}
    >
      {!embedded && title ? (
        <div
          className="text-center text-base md:text-lg font-bold tracking-wide"
          style={{ color: dark ? '#22d3ee' : '#0891b2' }}
        >
          {title}
        </div>
      ) : null}

      {chrome.map((item) => {
        const Comp = resolveWidget(item.widget);
        const data = doc.data[item.data_ref];
        return (
          <div key={item.id} className={item.widget === 'kpi_strip' ? 'min-h-[72px]' : ''}>
            <Comp
              item={item}
              data={data}
              theme={theme}
              language={language}
              height="100%"
              title={localizeTitle(item, language, dict)}
            />
          </div>
        );
      })}

      <div
        className={`grid gap-3 ${fullscreen ? 'flex-1 min-h-0' : ''}`}
        style={
          fullscreen
            ? {
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(180px, 1fr))`,
                minHeight: 480,
              }
            : {
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, ${chatRowH}px)`,
                minHeight: rows * chatRowH + (rows - 1) * 12,
              }
        }
      >
        {gridItems.map((item) => {
          const Comp = resolveWidget(item.widget);
          const spanCol = item.span && cols >= 2 ? Math.min(item.span.col, cols) : 1;
          const spanRow = item.span && cols >= 2 ? item.span.row || 1 : 1;
          const cellH = fullscreen ? undefined : chatRowH * spanRow + (spanRow - 1) * 12;
          const data = doc.data[item.data_ref];
          // Pass pixel height to canvas widgets so "100%" is never misread as 100px
          const widgetHeight = cellH ? `${cellH - 8}px` : '100%';
          return (
            <div
              key={item.id}
              className="relative rounded-xl border overflow-hidden"
              style={{
                gridColumn: `span ${spanCol}`,
                gridRow: `span ${spanRow}`,
                borderColor: dark ? 'rgba(34,211,238,0.18)' : 'rgba(8,145,178,0.18)',
                background: dark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.92)',
                height: cellH,
                boxShadow: dark ? 'inset 0 0 0 1px rgba(34,211,238,0.05)' : undefined,
              }}
            >
              {/* tech corners */}
              <div className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-cyan-400/50" />
              <div className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-cyan-400/50" />
              <div className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-cyan-400/50" />
              <div className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-cyan-400/50" />
              <div className="h-full p-1">
                <Comp
                  item={item}
                  data={data}
                  theme={theme}
                  language={language}
                  height={widgetHeight}
                  title={localizeTitle(item, language, dict)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!embedded && doc.insights && doc.insights.length > 0 ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs space-y-1"
          style={{
            borderColor: dark ? 'rgba(251,191,36,0.25)' : 'rgba(217,119,6,0.25)',
            color: dark ? '#fde68a' : '#92400e',
            background: dark ? 'rgba(251,191,36,0.06)' : 'rgba(251,191,36,0.1)',
          }}
        >
          {doc.insights.slice(0, 4).map((line, i) => (
            <div key={i}>• {line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
