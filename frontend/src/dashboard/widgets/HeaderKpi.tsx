import type { WidgetRenderProps, HeaderData, KpiItem } from '../types';

function isZh(language: string) {
  return /zh|中文|简|繁/i.test(language || '');
}

export function DashboardHeaderWidget({ data, language, theme }: WidgetRenderProps) {
  const d = (data || {}) as HeaderData;
  const dark = theme === 'dark';
  const status = d.status || 'live';
  const statusColor =
    status === 'live' ? '#34d399' : status === 'simulated' ? '#fbbf24' : '#94a3b8';

  return (
    <div
      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border"
      style={{
        borderColor: dark ? 'rgba(34,211,238,0.25)' : 'rgba(8,145,178,0.25)',
        background: dark
          ? 'linear-gradient(90deg, rgba(15,23,42,0.9), rgba(8,47,73,0.55))'
          : 'rgba(255,255,255,0.9)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: statusColor }}
          />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: statusColor }} />
        </span>
        <span className="text-xs font-mono tracking-wider" style={{ color: statusColor }}>
          {String(status).toUpperCase()}
          {d.subtitle ? ` · ${d.subtitle}` : ''}
        </span>
      </div>
      <div className="text-[11px] opacity-70" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
        {d.clock !== false
          ? new Date().toLocaleString(isZh(language) ? 'zh-CN' : 'en-US', {
              hour12: false,
            })
          : null}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  cyan: '#22d3ee',
  green: '#34d399',
  amber: '#fbbf24',
  blue: '#3b82f6',
  red: '#ef4444',
};

export function KpiStripWidget({ data, language, theme }: WidgetRenderProps) {
  const items = (Array.isArray(data) ? data : []) as KpiItem[];
  const dark = theme === 'dark';
  const zh = isZh(language);

  return (
    <div className="grid gap-2 h-full" style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}>
      {items.map((k, i) => {
        const accent = TONE[k.tone || 'cyan'] || TONE.cyan;
        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl border px-3 py-2.5 flex flex-col justify-center"
            style={{
              borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
              background: dark ? 'rgba(15,23,42,0.65)' : 'rgba(255,255,255,0.92)',
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
            />
            <div className="text-[11px] mb-1" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
              {zh ? k.label : k.label_en || k.label}
            </div>
            <div className="text-xl font-bold tabular-nums tracking-tight" style={{ color: dark ? '#e2e8f0' : '#0f172a' }}>
              {k.value}
            </div>
            {k.delta ? (
              <div className="text-[11px] mt-0.5 font-mono" style={{ color: accent }}>
                {k.delta}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
