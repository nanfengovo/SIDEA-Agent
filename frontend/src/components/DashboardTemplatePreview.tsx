import React from 'react';
import IframeViewer from './IframeViewer';

interface StyleConfig {
  bg: string;
  bgGrad: string;
  primary: string;
  secondary: string;
  accent: string;
  border: string;
  glow: string;
  text: string;
  grid: string;
  scanLine: boolean;
  gridPattern: boolean;
}

const STYLE_CONFIGS: Record<string, StyleConfig> = {
  '科技蓝': {
    bg: '#010D1A', bgGrad: 'linear-gradient(135deg,#010D1A 0%,#02152A 100%)',
    primary: '#00D4FF', secondary: '#0070B8', accent: '#00AAEE',
    border: '#00D4FF', glow: '0 0 20px rgba(0,212,255,0.5)', text: '#E0F4FF',
    grid: 'rgba(0,170,238,0.08)', scanLine: true, gridPattern: true,
  },
  '赛博朋克': {
    bg: '#05000D', bgGrad: 'linear-gradient(135deg,#05000D 0%,#100018 100%)',
    primary: '#FF00FF', secondary: '#00FFFF', accent: '#FF44FF',
    border: '#FF00FF', glow: '0 0 30px rgba(255,0,255,0.6)', text: '#FFE0FF',
    grid: 'rgba(0,255,255,0.07)', scanLine: true, gridPattern: true,
  },
  '暗金': {
    bg: '#0A0800', bgGrad: 'linear-gradient(135deg,#0A0800 0%,#1A1200 100%)',
    primary: '#FFD700', secondary: '#B8860B', accent: '#FFAA00',
    border: '#FFD700', glow: '0 0 25px rgba(255,215,0,0.5)', text: '#FFF8DC',
    grid: 'rgba(255,200,0,0.06)', scanLine: false, gridPattern: true,
  },
  '工业': {
    bg: '#080A0F', bgGrad: 'linear-gradient(135deg,#080A0F 0%,#141820 100%)',
    primary: '#FF6600', secondary: '#CC4400', accent: '#FF8833',
    border: '#FF6600', glow: '0 0 20px rgba(255,102,0,0.4)', text: '#FFE8D0',
    grid: 'rgba(255,102,0,0.06)', scanLine: false, gridPattern: false,
  },
  '全息': {
    bg: '#020E0A', bgGrad: 'linear-gradient(135deg,#020E0A 0%,#051A0F 100%)',
    primary: '#00FFCC', secondary: '#008855', accent: '#00DDAA',
    border: '#00FFCC', glow: '0 0 30px rgba(0,255,204,0.5)', text: '#D0FFF5',
    grid: 'rgba(0,255,204,0.07)', scanLine: true, gridPattern: true,
  },
  '矩阵绿': {
    bg: '#000500', bgGrad: 'linear-gradient(135deg,#000500 0%,#000D00 100%)',
    primary: '#00FF41', secondary: '#007A20', accent: '#00CC33',
    border: '#00FF41', glow: '0 0 25px rgba(0,255,65,0.5)', text: '#C8FFC8',
    grid: 'rgba(0,255,65,0.08)', scanLine: true, gridPattern: false,
  },
  '告警红': {
    bg: '#0D0000', bgGrad: 'linear-gradient(135deg,#0D0000 0%,#1A0000 100%)',
    primary: '#FF2222', secondary: '#AA0000', accent: '#FF5555',
    border: '#FF2222', glow: '0 0 25px rgba(255,34,34,0.5)', text: '#FFD5D5',
    grid: 'rgba(255,34,34,0.06)', scanLine: true, gridPattern: false,
  },
  '极简': {
    bg: '#0E0E12', bgGrad: 'linear-gradient(135deg,#0E0E12 0%,#18181F 100%)',
    primary: '#E2E8F0', secondary: '#64748B', accent: '#94A3B8',
    border: '#334155', glow: 'none', text: '#F1F5F9',
    grid: 'rgba(148,163,184,0.05)', scanLine: false, gridPattern: false,
  },
  '工业橙': {
    bg: '#0A0800', bgGrad: 'linear-gradient(135deg,#0A0800 0%,#1A1200 100%)',
    primary: '#FF6600', secondary: '#CC4400', accent: '#FF8833',
    border: '#FF6600', glow: '0 0 20px rgba(255,102,0,0.4)', text: '#FFE8D0',
    grid: 'rgba(255,102,0,0.06)', scanLine: false, gridPattern: false,
  },
  '全息投影': {
    bg: '#020E0A', bgGrad: 'linear-gradient(135deg,#020E0A 0%,#051A0F 100%)',
    primary: '#00FFCC', secondary: '#008855', accent: '#00DDAA',
    border: '#00FFCC', glow: '0 0 30px rgba(0,255,204,0.5)', text: '#D0FFF5',
    grid: 'rgba(0,255,204,0.07)', scanLine: true, gridPattern: true,
  },
  '极简白': {
    bg: '#F8FAFC', bgGrad: 'linear-gradient(135deg,#F8FAFC 0%,#E2E8F0 100%)',
    primary: '#1E293B', secondary: '#64748B', accent: '#3B82F6',
    border: '#CBD5E1', glow: 'none', text: '#0F172A',
    grid: 'rgba(100,116,139,0.1)', scanLine: false, gridPattern: false,
  },
};

const DEFAULT_STYLE = STYLE_CONFIGS['科技蓝'];

function getStyle(style: string): StyleConfig {
  return STYLE_CONFIGS[style] || DEFAULT_STYLE;
}

interface Props {
  style: string;
  category: string;
  scenario: string;
  name: string;
  subcategory?: string;
  tags?: string[];
  has3d?: boolean;
  miniature?: boolean; // true = card thumbnail mode
  previewUrl?: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean; // fill container completely
}

export const DashboardTemplatePreview: React.FC<Props> = ({
  style,
  category,
  scenario,
  name,
  subcategory,
  tags = [],
  has3d = false,
  miniature = false,
  previewUrl,
  width,
  height,
  fill = false,
}) => {
  const s = getStyle(style);

  // External iframe integration (only in full preview mode)
  if (previewUrl && !miniature) {
    return (
      <div className="w-full h-full p-4" style={{ backgroundColor: s.bg }}>
        <div className="w-full h-full border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl relative">
          <IframeViewer url={previewUrl} data={{ name, category, scenario, style }} />
          {/* Subtle overlay header */}
          <div className="absolute top-0 left-0 w-full px-4 py-2 bg-black/60 backdrop-blur border-b border-white/10 flex justify-between items-center pointer-events-none z-20">
            <div className="flex items-center gap-2 text-white/80">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: s.primary }}></span>
              <span className="font-mono text-xs font-bold tracking-wider">EXTERNAL TEMPLATE INTEGRATION</span>
            </div>
            <div className="text-[10px] text-white/50 font-mono">{previewUrl}</div>
          </div>
        </div>
      </div>
    );
  }

  // Layout dimensions (full-scale, SVG viewBox 800x500)
  const VW = 800, VH = 500;

  const charts = getChartLayouts(category, scenario, has3d, subcategory);

  // KPI Row is hidden if we have specific subcategories that replace the entire layout
  const isCustomArchetype = subcategory && ['agv_twin', 'plc_topology', 'chassis_monitor', 'general_dashboard'].includes(subcategory);
  const hideKPIRow = isCustomArchetype || (subcategory && ['ceo_cockpit', 'factory_twin', 'alarm_center', 'geo_map_view', 'kpi_board', 'sales_cockpit'].includes(subcategory));

  const kpis = hideKPIRow ? [] : getKPIs(category, scenario);

  // Unique IDs to avoid SVG filter/gradient collisions between multiple instances
  const uid = `${style.replace(/[^a-z0-9]/gi, '')}-${category}-${scenario}-${has3d ? '3d' : '2d'}`;
  const glowId = `glow-${uid}`;
  const gridId = `grid-${uid}`;
  const scanId = `scan-${uid}`;

  const svgW = fill ? '100%' : (width ?? VW);
  const svgH = fill ? '100%' : (height ?? VH);

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block', borderRadius: miniature ? 4 : 0, background: s.bgGrad }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Glow filter */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={miniature ? 1 : 3} result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Grid pattern */}
        {s.gridPattern && (
          <pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={s.grid} strokeWidth="0.5" />
          </pattern>
        )}
        {/* Scan line overlay */}
        {s.scanLine && (
          <pattern id={scanId} width="100%" height="4" patternUnits="userSpaceOnUse">
            <rect width="100%" height="2" fill="rgba(0,0,0,0.12)" />
          </pattern>
        )}
      </defs>

      {/* ── Background ── */}
      {s.gridPattern && <rect width={VW} height={VH} fill={`url(#${gridId})`} />}

      {/* ── Header Bar ── */}
      <HeaderBar s={s} name={name} scenario={scenario} tags={tags} has3d={has3d} VW={VW} glowId={glowId} />

      {/* ── KPI Row ── */}
      {!hideKPIRow && <KPIRow s={s} kpis={kpis} VW={VW} glowId={glowId} />}

      {/* ── Chart Panels / Custom Layouts ── */}
      {isCustomArchetype ? (
        <>
          {subcategory === 'agv_twin' && <AgvTwinLayout s={s} VW={VW} VH={VH} glowId={glowId} />}
          {subcategory === 'plc_topology' && <PlcTopologyLayout s={s} VW={VW} VH={VH} glowId={glowId} />}
          {subcategory === 'chassis_monitor' && <ChassisMonitorLayout s={s} VW={VW} VH={VH} glowId={glowId} />}
          {subcategory === 'general_dashboard' && <GeneralDashboardLayout s={s} VW={VW} VH={VH} glowId={glowId} />}
        </>
      ) : (
        <ChartPanels s={s} charts={charts} glowId={glowId} has3d={has3d} />
      )}

      {/* ── Scan lines overlay ── */}
      {s.scanLine && <rect width={VW} height={VH} fill={`url(#${scanId})`} opacity={0.4} style={{ pointerEvents: 'none' }} />}

      {/* ── Corner decorations ── */}
      <CornerDecors s={s} VW={VW} VH={VH} />
    </svg>
  );
};

/* ──────────────────────── Sub-components ──────────────────────── */

function HeaderBar({ s, name, scenario, tags, has3d, VW, glowId }: any) {
  return (
    <g>
      {/* Header bg */}
      <rect x="0" y="0" width={VW} height="40" fill={`rgba(0,0,0,0.5)`} />
      <line x1="0" y1="40" x2={VW} y2="40" stroke={s.primary} strokeWidth="1.5" opacity="0.7" filter={`url(#${glowId})`} />
      {/* Left accent bar */}
      <rect x="0" y="0" width="3" height="40" fill={s.primary} />
      {/* Logo hexagon */}
      <polygon points="18,8 26,4 34,8 34,24 26,28 18,24" fill="none" stroke={s.primary} strokeWidth="1" opacity="0.8" />
      <text x="26" y="19" textAnchor="middle" fill={s.primary} fontSize="7" fontWeight="bold">S</text>
      {/* Title */}
      <text x="44" y="17" fill={s.text} fontSize="11" fontWeight="bold" letterSpacing="2">{name.toUpperCase()}</text>
      <text x="44" y="31" fill={s.accent} fontSize="7" opacity="0.7" letterSpacing="1">{scenario} • INDUSTRIAL ANALYTICS PLATFORM</text>
      
      {/* Tags */}
      {tags && tags.length > 0 && (
        <g>
          {tags.map((tag: string, i: number) => {
            const tagX = VW - 200 - (i * 45);
            return (
              <g key={i}>
                <rect x={tagX} y="12" width="40" height="16" rx="2" fill={s.primary} opacity="0.2" />
                <text x={tagX + 20} y="23" textAnchor="middle" fill={s.primary} fontSize="7" fontWeight="bold">{tag}</text>
              </g>
            );
          })}
        </g>
      )}

      {/* Right: time & status */}
      <StatusBar s={s} VW={VW} has3d={has3d} />
    </g>
  );
}

function StatusBar({ s, VW, has3d }: any) {
  return (
    <g>
      {has3d && (
        <g>
          <rect x={VW - 90} y="10" width="38" height="16" rx="3" fill={s.primary} opacity="0.15" stroke={s.primary} strokeWidth="0.5" />
          <text x={VW - 71} y="21" textAnchor="middle" fill={s.primary} fontSize="6" fontWeight="bold">3D孪生</text>
        </g>
      )}
      {/* Status dots */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={VW - 140 + i * 14} cy="20" r="3" fill={i === 0 ? '#22c55e' : i === 1 ? s.primary : s.secondary} opacity="0.9" />
      ))}
      <text x={VW - 100} y="36" textAnchor="end" fill={s.text} fontSize="7" opacity="0.5">00:00 • LIVE</text>
    </g>
  );
}

function KPIRow({ s, kpis, VW, glowId }: any) {
  if (!kpis || kpis.length === 0) return null;
  const cardW = Math.floor((VW - 20) / kpis.length) - 6;
  const cardH = 52;
  const y = 48;

  return (
    <g>
      {kpis.map((kpi: any, i: number) => {
        const x = 10 + i * (cardW + 6);
        return (
          <g key={i}>
            <rect x={x} y={y} width={cardW} height={cardH} rx="4"
              fill="rgba(0,0,0,0.4)" stroke={s.border} strokeWidth="0.5" opacity="0.7" />
            <rect x={x} y={y} width="2" height={cardH} rx="1" fill={kpi.color || s.primary} />
            <text x={x + 10} y={y + 16} fill={s.text} fontSize="7" opacity="0.6" letterSpacing="0.5">{kpi.label}</text>
            <text x={x + 10} y={y + 33} fill={kpi.color || s.primary} fontSize="16" fontWeight="bold" filter={`url(#${glowId})`}>{kpi.value}</text>
            <text x={x + 10} y={y + 44} fill={kpi.color || s.primary} fontSize="7" opacity="0.7">{kpi.unit}</text>
            <text x={x + cardW - 16} y={y + 35} fill={kpi.trend > 0 ? '#22c55e' : '#ef4444'} fontSize="10">{kpi.trend > 0 ? '↑' : '↓'}</text>
          </g>
        );
      })}
    </g>
  );
}

function ChartPanels({ s, charts, glowId, has3d }: any) {
  return (
    <g>
      {charts.map((chart: any, i: number) => (
        <ChartPanel key={i} s={s} chart={chart} glowId={glowId} has3d={has3d} />
      ))}
    </g>
  );
}

function ChartPanel({ s, chart, glowId, has3d }: any) {
  const { x, y, w, h, type, title } = chart;

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill="rgba(0,0,0,0.45)" stroke={s.border} strokeWidth="0.5" opacity="0.8" />
      <line x1={x + 1} y1={y + 1} x2={x + w - 1} y2={y + 1} stroke={s.primary} strokeWidth="1" opacity="0.5" />
      {[
        [[x, y], [x + 8, y], [x, y + 8]],
        [[x + w, y], [x + w - 8, y], [x + w, y + 8]],
        [[x, y + h], [x + 8, y + h], [x, y + h - 8]],
        [[x + w, y + h], [x + w - 8, y + h], [x + w, y + h - 8]],
      ].map(([a, b, c], ci) => (
        <g key={ci} stroke={s.primary} strokeWidth="1.2" fill="none" opacity="0.6">
          <polyline points={`${b[0]},${b[1]} ${a[0]},${a[1]} ${c[0]},${c[1]}`} />
        </g>
      ))}
      <text x={x + 8} y={y + 14} fill={s.text} fontSize="7" opacity="0.7" letterSpacing="0.5">
        {`| ${title.toUpperCase()}`}
      </text>

      <ChartContent s={s} chart={chart} glowId={glowId} has3d={has3d} />
    </g>
  );
}

function ChartContent({ s, chart, glowId, has3d }: any) {
  const { x, y, w, h, type } = chart;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const innerX = x + 8;
  const innerY = y + 20;
  const innerW = w - 16;
  const innerH = h - 30;

  if (type === 'line') return <LineChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'bar') return <BarChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'pie') return <PieChart s={s} cx={cx} cy={cy + 6} r={Math.min(w, h) * 0.28} />;
  if (type === 'gauge') return <GaugeChart s={s} cx={cx} cy={cy + 8} r={Math.min(w, h) * 0.3} glowId={glowId} />;
  if (type === 'map3d') return <Map3D s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'heatmap') return <HeatMap s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  if (type === 'radar') return <RadarChart s={s} cx={cx} cy={cy + 6} r={Math.min(w, h) * 0.3} glowId={glowId} />;
  if (type === 'kpi_list') return <KPIList s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  
  // New charts
  if (type === 'geo_map') return <GeoMap s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'flow_network') return <FlowNetwork s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'timeline') return <TimelineChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  if (type === 'scatter') return <ScatterChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'treemap') return <TreemapChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  if (type === 'number_card') return <NumberCard s={s} x={innerX} y={innerY} w={innerW} h={innerH} glowId={glowId} />;
  if (type === 'table') return <TableChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  if (type === 'progress_bar') return <ProgressBarChart s={s} x={innerX} y={innerY} w={innerW} h={innerH} />;
  
  return null;
}

function LineChart({ s, x, y, w, h, glowId }: any) {
  const pts = [0.6, 0.35, 0.55, 0.3, 0.45, 0.25, 0.4, 0.35, 0.5, 0.2, 0.38, 0.42];
  const n = pts.length;
  const points = pts.map((v, i) => `${x + (i / (n - 1)) * w},${y + v * h}`).join(' ');
  const areaPoints = `${x},${y + h} ${points} ${x + w},${y + h}`;
  return (
    <g>
      {[0.25, 0.5, 0.75].map((v, i) => (
        <line key={i} x1={x} y1={y + v * h} x2={x + w} y2={y + v * h} stroke={s.grid} strokeWidth="0.5" />
      ))}
      <polygon points={areaPoints} fill={s.primary} opacity="0.12" />
      <polyline points={points} fill="none" stroke={s.primary} strokeWidth="1.5" filter={`url(#${glowId})`} />
      {pts.map((v, i) => (
        <circle key={i} cx={x + (i / (n - 1)) * w} cy={y + v * h} r="2" fill={s.primary} opacity="0.9" filter={`url(#${glowId})`} />
      ))}
    </g>
  );
}

function BarChart({ s, x, y, w, h, glowId }: any) {
  const values = [0.7, 0.5, 0.85, 0.4, 0.65, 0.55, 0.75, 0.45];
  const barW = Math.max(4, (w / values.length) * 0.6);
  const gap = w / values.length;
  return (
    <g>
      {values.map((v, i) => {
        const bx = x + i * gap + (gap - barW) / 2;
        const bh = v * h;
        const by = y + h - bh;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={barW} height={bh} rx="1" fill={s.secondary} opacity="0.5" />
            <rect x={bx} y={by} width={barW} height={4} rx="1" fill={s.primary} filter={`url(#${glowId})`} />
          </g>
        );
      })}
    </g>
  );
}

function PieChart({ s, cx, cy, r }: any) {
  const slices = [
    { pct: 0.52, color: s.primary, label: 'A' },
    { pct: 0.28, color: s.secondary, label: 'B' },
    { pct: 0.12, color: '#f59e0b', label: 'C' },
    { pct: 0.08, color: '#ef4444', label: 'D' },
  ];
  let angle = -Math.PI / 2;
  const ri = r * 0.55;
  return (
    <g>
      {slices.map((sl, i) => {
        const start = angle;
        const end = angle + sl.pct * Math.PI * 2;
        angle = end;
        const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
        const xi1 = cx + ri * Math.cos(start), yi1 = cy + ri * Math.sin(start);
        const xi2 = cx + ri * Math.cos(end), yi2 = cy + ri * Math.sin(end);
        const large = sl.pct > 0.5 ? 1 : 0;
        return (
          <path key={i}
            d={`M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`}
            fill={sl.color} opacity="0.85" />
        );
      })}
      <text x={cx} y={cy} textAnchor="middle" fill={s.primary} fontSize="10" fontWeight="bold" dy="4">87%</text>
    </g>
  );
}

function GaugeChart({ s, cx, cy, r, glowId }: any) {
  const startAngle = Math.PI * 0.75;
  const endAngle = Math.PI * 2.25;
  const fillAngle = startAngle + 0.78 * (endAngle - startAngle);
  const toXY = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const [sx, sy] = toXY(startAngle, r);
  const [ex, ey] = toXY(endAngle, r);
  const [fx, fy] = toXY(fillAngle, r);

  return (
    <g>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`} fill="none" stroke={s.grid} strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${fx} ${fy}`} fill="none" stroke={s.primary} strokeWidth="6" strokeLinecap="round" filter={`url(#${glowId})`} />
      <text x={cx} y={cy} textAnchor="middle" fill={s.primary} fontSize="14" fontWeight="bold" dy="4" filter={`url(#${glowId})`}>78%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={s.text} fontSize="6" opacity="0.7">OEE</text>
    </g>
  );
}

function Map3D({ s, x, y, w, h, glowId }: any) {
  const rows = 5, cols = 8;
  const tw = w / cols, th = h / (rows + 2);
  const cells = [
    [1,1,1,1,0,1,1,1],
    [1,0,1,1,1,1,0,1],
    [1,1,0,1,1,1,1,1],
    [1,1,1,0,1,0,1,1],
    [0,1,1,1,1,1,1,0],
  ];
  const robots = [{ col: 2, row: 1, color: '#22c55e' }, { col: 5, row: 3, color: '#f59e0b' }, { col: 7, row: 0, color: '#ef4444' }];

  return (
    <g>
      {cells.map((row, ri) =>
        row.map((cell, ci) => (
          <rect key={`${ri}-${ci}`} x={x + ci * tw + tw * 0.1} y={y + ri * th + th * 0.1} width={tw * 0.8} height={th * 0.8} rx="1"
            fill={cell ? s.secondary : 'transparent'} stroke={s.primary} strokeWidth="0.5" opacity={cell ? 0.3 : 0.15} />
        ))
      )}
      <polyline points={`${x + 2 * tw + tw / 2},${y + th / 2} ${x + 5 * tw + tw / 2},${y + 3 * th + th / 2}`}
        fill="none" stroke={s.primary} strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" />
      {robots.map((r, i) => (
        <g key={i} filter={`url(#${glowId})`}>
          <circle cx={x + r.col * tw + tw / 2} cy={y + r.row * th + th / 2} r={Math.min(tw, th) * 0.25} fill={r.color} opacity="0.9" />
          <circle cx={x + r.col * tw + tw / 2} cy={y + r.row * th + th / 2} r={Math.min(tw, th) * 0.4} fill="none" stroke={r.color} strokeWidth="0.5" opacity="0.5" />
        </g>
      ))}
      <line x1={x} y1={y + h * 0.6} x2={x + w} y2={y + h * 0.6} stroke={s.primary} strokeWidth="1" opacity="0.3" filter={`url(#${glowId})`} />
    </g>
  );
}

function HeatMap({ s, x, y, w, h }: any) {
  const rows = 6, cols = 10;
  const cw = w / cols, ch = h / rows;
  const colors = ['#1e3a5f', '#1a5c4f', '#2d7a3f', '#5a8a2f', '#8a7a1f', '#aa5f1f', '#cc3f1f', '#ee1f0f'];
  return (
    <g>
      {Array.from({ length: rows }).map((_, ri) =>
        Array.from({ length: cols }).map((_, ci) => {
          const v = Math.random();
          const colorIdx = Math.min(7, Math.floor(v * 8));
          return (
            <rect key={`${ri}-${ci}`} x={x + ci * cw} y={y + ri * ch} width={cw - 0.5} height={ch - 0.5} fill={colors[colorIdx]} opacity="0.75" />
          );
        })
      )}
    </g>
  );
}

function RadarChart({ s, cx, cy, r, glowId }: any) {
  const axes = 6;
  const values = [0.8, 0.65, 0.9, 0.55, 0.75, 0.7];
  const pts = values.map((v, i) => {
    const a = (i / axes) * Math.PI * 2 - Math.PI / 2;
    return [cx + v * r * Math.cos(a), cy + v * r * Math.sin(a)];
  });

  const rings = [0.33, 0.67, 1.0];
  return (
    <g>
      {rings.map((ring, ri) => {
        const rpts = Array.from({ length: axes }).map((_, i) => {
          const a = (i / axes) * Math.PI * 2 - Math.PI / 2;
          return `${cx + ring * r * Math.cos(a)},${cy + ring * r * Math.sin(a)}`;
        }).join(' ');
        return <polygon key={ri} points={rpts} fill="none" stroke={s.grid} strokeWidth="0.5" />;
      })}
      {Array.from({ length: axes }).map((_, i) => {
        const a = (i / axes) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke={s.grid} strokeWidth="0.5" />;
      })}
      <polygon points={pts.map(p => p.join(',')).join(' ')} fill={s.primary} fillOpacity="0.2" stroke={s.primary} strokeWidth="1.2" filter={`url(#${glowId})`} />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="2" fill={s.primary} filter={`url(#${glowId})`} />
      ))}
    </g>
  );
}

function KPIList({ s, x, y, w, h }: any) {
  const items = [
    { label: 'AGV在线率', value: '97.3%', ok: true },
    { label: '任务完成率', value: '99.1%', ok: true },
    { label: '平均响应', value: '1.24s', ok: true },
    { label: '告警数量', value: '3', ok: false },
  ];
  const rowH = h / items.length;
  return (
    <g>
      {items.map((item, i) => (
        <g key={i}>
          <rect x={x} y={y + i * rowH + 1} width={w} height={rowH - 2} rx="2" fill={item.ok ? 'rgba(0,200,100,0.05)' : 'rgba(255,50,50,0.08)'} />
          <circle cx={x + 6} cy={y + i * rowH + rowH / 2} r="2.5" fill={item.ok ? '#22c55e' : '#ef4444'} />
          <text x={x + 16} y={y + i * rowH + rowH / 2 + 3} fill={s.text} fontSize="7" opacity="0.7">{item.label}</text>
          <text x={x + w - 4} y={y + i * rowH + rowH / 2 + 3} textAnchor="end" fill={item.ok ? s.primary : '#ef4444'} fontSize="8" fontWeight="bold">{item.value}</text>
        </g>
      ))}
    </g>
  );
}

// ── New Charts ──

function GeoMap({ s, x, y, w, h, glowId }: any) {
  return (
    <g>
      <path d={`M${x+w*0.1},${y+h*0.3} Q${x+w*0.3},${y+h*0.1} ${x+w*0.5},${y+h*0.4} T${x+w*0.9},${y+h*0.2} Q${x+w*0.8},${y+h*0.8} ${x+w*0.4},${y+h*0.9} Z`} fill={s.primary} opacity="0.1" stroke={s.primary} strokeWidth="1" />
      <circle cx={x+w*0.3} cy={y+h*0.4} r="3" fill={s.secondary} filter={`url(#${glowId})`} />
      <circle cx={x+w*0.6} cy={y+h*0.6} r="4" fill={s.accent} filter={`url(#${glowId})`} />
      <circle cx={x+w*0.8} cy={y+h*0.3} r="2" fill={s.primary} filter={`url(#${glowId})`} />
      <path d={`M${x+w*0.3},${y+h*0.4} L${x+w*0.6},${y+h*0.6} L${x+w*0.8},${y+h*0.3}`} fill="none" stroke={s.primary} strokeWidth="0.5" strokeDasharray="2,2" />
    </g>
  );
}

function FlowNetwork({ s, x, y, w, h, glowId }: any) {
  const nodes = [
    {cx: x+w*0.2, cy: y+h*0.5, r: 8},
    {cx: x+w*0.5, cy: y+h*0.2, r: 12},
    {cx: x+w*0.5, cy: y+h*0.8, r: 10},
    {cx: x+w*0.8, cy: y+h*0.5, r: 15},
  ];
  return (
    <g>
      <line x1={nodes[0].cx} y1={nodes[0].cy} x2={nodes[1].cx} y2={nodes[1].cy} stroke={s.secondary} strokeWidth="2" opacity="0.6" />
      <line x1={nodes[0].cx} y1={nodes[0].cy} x2={nodes[2].cx} y2={nodes[2].cy} stroke={s.secondary} strokeWidth="2" opacity="0.6" />
      <line x1={nodes[1].cx} y1={nodes[1].cy} x2={nodes[3].cx} y2={nodes[3].cy} stroke={s.primary} strokeWidth="3" opacity="0.8" />
      <line x1={nodes[2].cx} y1={nodes[2].cy} x2={nodes[3].cx} y2={nodes[3].cy} stroke={s.primary} strokeWidth="1.5" opacity="0.6" />
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={s.accent} filter={`url(#${glowId})`} opacity="0.9" stroke={s.bg} strokeWidth="2" />
      ))}
    </g>
  );
}

function TimelineChart({ s, x, y, w, h }: any) {
  const cy = y + h/2;
  const events = [0.1, 0.4, 0.6, 0.85];
  return (
    <g>
      <line x1={x+w*0.05} y1={cy} x2={x+w*0.95} y2={cy} stroke={s.grid} strokeWidth="2" />
      {events.map((pct, i) => (
        <g key={i}>
          <circle cx={x + w*pct} cy={cy} r="4" fill={s.primary} />
          <rect x={x + w*pct - 15} y={i%2===0 ? cy-20 : cy+10} width="30" height="10" rx="2" fill={s.secondary} opacity="0.4" />
          <text x={x + w*pct} y={i%2===0 ? cy-13 : cy+17} textAnchor="middle" fill={s.text} fontSize="6">Evt {i+1}</text>
        </g>
      ))}
    </g>
  );
}

function ScatterChart({ s, x, y, w, h, glowId }: any) {
  const pts = Array.from({length: 30}).map(() => ({
    cx: x + Math.random()*w,
    cy: y + Math.random()*h,
    r: 1.5 + Math.random()*2
  }));
  return (
    <g>
      <line x1={x} y1={y+h} x2={x+w} y2={y+h} stroke={s.grid} strokeWidth="1" />
      <line x1={x} y1={y} x2={x} y2={y+h} stroke={s.grid} strokeWidth="1" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={s.primary} opacity="0.7" filter={`url(#${glowId})`} />
      ))}
    </g>
  );
}

function TreemapChart({ s, x, y, w, h }: any) {
  const rects = [
    { rx: x, ry: y, rw: w*0.6, rh: h*0.6, color: s.primary },
    { rx: x+w*0.6, ry: y, rw: w*0.4, rh: h*0.4, color: s.secondary },
    { rx: x, ry: y+h*0.6, rw: w*0.3, rh: h*0.4, color: s.accent },
    { rx: x+w*0.3, ry: y+h*0.6, rw: w*0.3, rh: h*0.4, color: s.primary },
    { rx: x+w*0.6, ry: y+h*0.4, rw: w*0.4, rh: h*0.6, color: s.secondary },
  ];
  return (
    <g>
      {rects.map((r, i) => (
        <g key={i}>
          <rect x={r.rx+1} y={r.ry+1} width={r.rw-2} height={r.rh-2} fill={r.color} opacity={0.5 + Math.random()*0.4} rx="2" />
          <text x={r.rx+5} y={r.ry+12} fill={s.text} fontSize="7" opacity="0.8">Seg {i}</text>
        </g>
      ))}
    </g>
  );
}

function NumberCard({ s, x, y, w, h, glowId }: any) {
  const val = Math.floor(Math.random()*9000 + 1000);
  const pts = Array.from({length: 10}).map((_, i) => `${x + (i/9)*w},${y + h*0.7 + Math.random()*h*0.3}`);
  return (
    <g>
      <text x={x+w/2} y={y+h*0.5} textAnchor="middle" fill={s.primary} fontSize={Math.min(w*0.3, 32)} fontWeight="bold" filter={`url(#${glowId})`}>{val.toLocaleString()}</text>
      <polyline points={pts.join(' ')} fill="none" stroke={s.secondary} strokeWidth="1" opacity="0.6" />
    </g>
  );
}

function TableChart({ s, x, y, w, h }: any) {
  const rows = 5;
  const rh = h / rows;
  return (
    <g>
      {Array.from({length: rows}).map((_, i) => (
        <g key={i}>
          <rect x={x} y={y + i*rh + 1} width={w} height={rh - 2} fill={i%2===0 ? s.grid : 'transparent'} rx="2" />
          <text x={x+4} y={y + i*rh + rh*0.65} fill={s.text} fontSize="6" opacity="0.7">ID-10{i}</text>
          <text x={x+w*0.4} y={y + i*rh + rh*0.65} fill={s.text} fontSize="6" opacity="0.7">Status {i%2===0?'OK':'WARN'}</text>
          <text x={x+w-4} y={y + i*rh + rh*0.65} textAnchor="end" fill={s.primary} fontSize="6">{(Math.random()*100).toFixed(1)}</text>
        </g>
      ))}
    </g>
  );
}

function ProgressBarChart({ s, x, y, w, h }: any) {
  const bars = [0.8, 0.65, 0.9, 0.4, 0.75];
  const rh = h / bars.length;
  return (
    <g>
      {bars.map((pct, i) => (
        <g key={i}>
          <text x={x} y={y + i*rh + rh*0.4} fill={s.text} fontSize="6" opacity="0.7">Item {i+1}</text>
          <rect x={x+w*0.2} y={y + i*rh + rh*0.2} width={w*0.8} height={rh*0.4} rx="2" fill={s.grid} />
          <rect x={x+w*0.2} y={y + i*rh + rh*0.2} width={w*0.8*pct} height={rh*0.4} rx="2" fill={s.primary} opacity="0.8" />
          <text x={x+w*0.2 + w*0.8*pct + 4} y={y + i*rh + rh*0.4} fill={s.primary} fontSize="6">{(pct*100).toFixed(0)}%</text>
        </g>
      ))}
    </g>
  );
}

function CornerDecors({ s, VW, VH }: any) {
  return (
    <g opacity="0.4">
      <line x1="0" y1={VH - 8} x2="60" y2={VH - 8} stroke={s.primary} strokeWidth="0.5" />
      <line x1="0" y1={VH - 8} x2="0" y2={VH - 40} stroke={s.primary} strokeWidth="0.5" />
      <line x1={VW} y1={VH - 8} x2={VW - 60} y2={VH - 8} stroke={s.primary} strokeWidth="0.5" />
      <line x1={VW} y1={VH - 8} x2={VW} y2={VH - 40} stroke={s.primary} strokeWidth="0.5" />
      <text x={VW / 2} y={VH - 2} textAnchor="middle" fill={s.primary} fontSize="5" opacity="0.5">
        SIDEA INDUSTRIAL INTELLIGENCE PLATFORM © 2025
      </text>
    </g>
  );
}

/* ──────────────────────── Data helpers ──────────────────────── */

function getKPIs(category: string, scenario: string) {
  if (scenario === 'RCS' || category === 'RCS') return [
    { label: 'AGV 在线数量', value: '48', unit: '台 / 52台', trend: 1, color: '#22c55e' },
    { label: '任务完成率', value: '99.1%', unit: '今日', trend: 1, color: '#00d4ff' },
    { label: '平均任务时长', value: '2.4', unit: 'min', trend: -1, color: '#f59e0b' },
    { label: '系统告警', value: '3', unit: '条未处理', trend: -1, color: '#ef4444' },
    { label: '货架利用率', value: '78.5%', unit: '', trend: 1, color: '#a78bfa' },
  ];
  if (scenario === '工厂' || category === 'Factory') return [
    { label: '当日产量', value: '1,248', unit: '件', trend: 1, color: '#22c55e' },
    { label: 'OEE效率', value: '87.2%', unit: '', trend: 1, color: '#00d4ff' },
    { label: '设备在线', value: '14/16', unit: '台', trend: 1, color: '#f59e0b' },
    { label: '不良率', value: '0.32%', unit: '', trend: -1, color: '#ef4444' },
    { label: '能耗指数', value: '312', unit: 'kWh', trend: -1, color: '#a78bfa' },
  ];
  if (scenario === '仓储') return [
    { label: '库位利用率', value: '82.4%', unit: '', trend: 1, color: '#22c55e' },
    { label: '今日入库', value: '1,842', unit: 'SKU', trend: 1, color: '#00d4ff' },
    { label: '今日出库', value: '2,315', unit: 'SKU', trend: 1, color: '#f59e0b' },
    { label: '拣货准确率', value: '99.7%', unit: '', trend: 1, color: '#22c55e' },
    { label: '待处理订单', value: '128', unit: '张', trend: -1, color: '#ef4444' },
  ];
  if (scenario === '能源') return [
    { label: '实时功率', value: '3.8', unit: 'MW', trend: 1, color: '#f59e0b' },
    { label: '今日发电', value: '84.2', unit: 'MWh', trend: 1, color: '#22c55e' },
    { label: 'PUE指数', value: '1.42', unit: '', trend: -1, color: '#00d4ff' },
    { label: '碳排放量', value: '12.6', unit: 't', trend: -1, color: '#ef4444' },
    { label: '综合效率', value: '91.3%', unit: '', trend: 1, color: '#a78bfa' },
  ];
  // Default general
  return [
    { label: '系统健康度', value: '97.3%', unit: '', trend: 1, color: '#22c55e' },
    { label: '活跃设备', value: '142', unit: '台', trend: 1, color: '#00d4ff' },
    { label: '告警数量', value: '7', unit: '条', trend: -1, color: '#ef4444' },
    { label: '今日任务', value: '3,841', unit: '笔', trend: 1, color: '#f59e0b' },
    { label: '完成率', value: '98.8%', unit: '', trend: 1, color: '#a78bfa' },
  ];
}

interface ChartLayout {
  x: number; y: number; w: number; h: number;
  type: string; title: string;
}

function getChartLayouts(category: string, scenario: string, has3d: boolean, subcategory?: string): ChartLayout[] {
  const top = 110, bottom = 490, left = 10, right = 790;
  const totalH = bottom - top;
  const totalW = right - left;

  // New layouts based on subcategory
  if (subcategory === 'ceo_cockpit') {
    return [
      { x: left, y: top, w: totalW * 0.32, h: totalH * 0.25, type: 'number_card', title: 'Total Revenue' },
      { x: left + totalW * 0.34, y: top, w: totalW * 0.32, h: totalH * 0.25, type: 'number_card', title: 'Net Profit' },
      { x: left + totalW * 0.68, y: top, w: totalW * 0.32, h: totalH * 0.25, type: 'number_card', title: 'Market Share' },
      
      { x: left, y: top + totalH * 0.28, w: totalW * 0.48, h: totalH * 0.35, type: 'line', title: 'Revenue Trend' },
      { x: left + totalW * 0.52, y: top + totalH * 0.28, w: totalW * 0.48, h: totalH * 0.35, type: 'bar', title: 'Regional Sales' },
      
      { x: left, y: top + totalH * 0.66, w: totalW * 0.32, h: totalH * 0.34, type: 'pie', title: 'Product Mix' },
      { x: left + totalW * 0.34, y: top + totalH * 0.66, w: totalW * 0.32, h: totalH * 0.34, type: 'progress_bar', title: 'Goal Completion' },
      { x: left + totalW * 0.68, y: top + totalH * 0.66, w: totalW * 0.32, h: totalH * 0.34, type: 'table', title: 'Top Performers' },
    ];
  }

  if (subcategory === 'factory_twin') {
    return [
      { x: left, y: top, w: totalW * 0.6, h: totalH, type: 'map3d', title: '3D Factory Twin' },
      { x: left + totalW * 0.6 + 6, y: top, w: totalW * 0.4 - 6, h: totalH * 0.23, type: 'gauge', title: 'OEE' },
      { x: left + totalW * 0.6 + 6, y: top + totalH * 0.25, w: totalW * 0.4 - 6, h: totalH * 0.23, type: 'bar', title: 'Output' },
      { x: left + totalW * 0.6 + 6, y: top + totalH * 0.5, w: totalW * 0.4 - 6, h: totalH * 0.23, type: 'timeline', title: 'Events' },
      { x: left + totalW * 0.6 + 6, y: top + totalH * 0.75, w: totalW * 0.4 - 6, h: totalH * 0.25, type: 'kpi_list', title: 'Alarms' },
    ];
  }

  if (subcategory === 'alarm_center') {
    return [
      { x: left, y: top, w: totalW, h: totalH * 0.15, type: 'progress_bar', title: 'Active Alerts Ticker' },
      { x: left, y: top + totalH * 0.18, w: totalW * 0.3, h: totalH * 0.82, type: 'treemap', title: 'Alarm Distribution' },
      { x: left + totalW * 0.3 + 6, y: top + totalH * 0.18, w: totalW * 0.4 - 6, h: totalH * 0.82, type: 'scatter', title: 'Anomaly Detection' },
      { x: left + totalW * 0.7 + 6, y: top + totalH * 0.18, w: totalW * 0.3 - 6, h: totalH * 0.82, type: 'table', title: 'Event List' },
    ];
  }

  if (subcategory === 'geo_map_view') {
    return [
      { x: left, y: top, w: totalW, h: totalH, type: 'geo_map', title: 'Global Logistics Network' },
      { x: left + 10, y: top + 10, w: totalW * 0.25, h: totalH * 0.25, type: 'number_card', title: 'Active Shipments' },
      { x: right - totalW * 0.25 - 10, y: top + 10, w: totalW * 0.25, h: totalH * 0.3, type: 'pie', title: 'Status' },
      { x: left + 10, y: bottom - totalH * 0.3 - 10, w: totalW * 0.3, h: totalH * 0.3, type: 'bar', title: 'Regional Volume' },
    ];
  }

  if (subcategory === 'kpi_board') {
    return [
      { x: left, y: top, w: totalW * 0.24, h: totalH * 0.3, type: 'number_card', title: 'Metric 1' },
      { x: left + totalW * 0.25, y: top, w: totalW * 0.24, h: totalH * 0.3, type: 'number_card', title: 'Metric 2' },
      { x: left + totalW * 0.5, y: top, w: totalW * 0.24, h: totalH * 0.3, type: 'number_card', title: 'Metric 3' },
      { x: left + totalW * 0.75, y: top, w: totalW * 0.24, h: totalH * 0.3, type: 'number_card', title: 'Metric 4' },

      { x: left, y: top + totalH * 0.33, w: totalW * 0.32, h: totalH * 0.3, type: 'progress_bar', title: 'Targets' },
      { x: left + totalW * 0.34, y: top + totalH * 0.33, w: totalW * 0.32, h: totalH * 0.3, type: 'kpi_list', title: 'Status' },
      { x: left + totalW * 0.68, y: top + totalH * 0.33, w: totalW * 0.32, h: totalH * 0.3, type: 'gauge', title: 'Performance' },

      { x: left, y: top + totalH * 0.66, w: totalW * 0.48, h: totalH * 0.34, type: 'table', title: 'Recent Records' },
      { x: left + totalW * 0.52, y: top + totalH * 0.66, w: totalW * 0.48, h: totalH * 0.34, type: 'timeline', title: 'Updates' },
    ];
  }

  if (subcategory === 'sales_cockpit') {
    return [
      { x: left, y: top, w: totalW * 0.3, h: totalH * 0.48, type: 'treemap', title: 'Sales Funnel / Segment' },
      { x: left + totalW * 0.32, y: top, w: totalW * 0.36, h: totalH * 0.48, type: 'bar', title: 'Revenue by Product' },
      { x: left + totalW * 0.7, y: top, w: totalW * 0.3, h: totalH * 0.48, type: 'geo_map', title: 'Geographic Distribution' },
      
      { x: left, y: top + totalH * 0.52, w: totalW * 0.6, h: totalH * 0.48, type: 'line', title: 'Sales Trend' },
      { x: left + totalW * 0.62, y: top + totalH * 0.52, w: totalW * 0.38, h: totalH * 0.48, type: 'flow_network', title: 'Lead Conversion' },
    ];
  }

  if (has3d) {
    return [
      { x: left, y: top, w: totalW * 0.55, h: totalH, type: 'map3d', title: '3D 数字孪生全景' },
      { x: left + totalW * 0.55 + 6, y: top, w: totalW * 0.45 - 6, h: totalH * 0.42, type: 'line', title: '任务吞吐趋势' },
      { x: left + totalW * 0.55 + 6, y: top + totalH * 0.42 + 6, w: totalW * 0.22, h: totalH * 0.58 - 6, type: 'pie', title: '状态分布' },
      { x: left + totalW * 0.55 + 6 + totalW * 0.22 + 4, y: top + totalH * 0.42 + 6, w: totalW * 0.23 - 10, h: totalH * 0.58 - 6, type: 'gauge', title: 'OEE' },
    ];
  }

  if (scenario === '驾驶舱' || category === 'Executive') {
    return [
      { x: left, y: top, w: totalW * 0.55, h: totalH * 0.5, type: 'line', title: '多维指标趋势' },
      { x: left + totalW * 0.55 + 6, y: top, w: totalW * 0.45 - 6, h: totalH * 0.5, type: 'radar', title: '综合运营雷达图' },
      { x: left, y: top + totalH * 0.5 + 6, w: totalW * 0.33, h: totalH * 0.5 - 6, type: 'bar', title: '分厂产能对比' },
      { x: left + totalW * 0.33 + 6, y: top + totalH * 0.5 + 6, w: totalW * 0.33, h: totalH * 0.5 - 6, type: 'pie', title: '资源占用分布' },
      { x: left + totalW * 0.66 + 12, y: top + totalH * 0.5 + 6, w: totalW * 0.34 - 12, h: totalH * 0.5 - 6, type: 'gauge', title: '关键绩效 KPI' },
    ];
  }

  if (scenario === 'RCS' || category === 'RCS') {
    return [
      { x: left, y: top, w: totalW * 0.45, h: totalH * 0.55, type: 'line', title: 'AGV任务吞吐趋势' },
      { x: left + totalW * 0.45 + 6, y: top, w: totalW * 0.55 - 6, h: totalH * 0.55, type: 'heatmap', title: '区域热力分布' },
      { x: left, y: top + totalH * 0.55 + 6, w: totalW * 0.3, h: totalH * 0.45 - 6, type: 'pie', title: 'AGV状态分布' },
      { x: left + totalW * 0.3 + 6, y: top + totalH * 0.55 + 6, w: totalW * 0.4, h: totalH * 0.45 - 6, type: 'bar', title: '路径利用率统计' },
      { x: left + totalW * 0.7 + 12, y: top + totalH * 0.55 + 6, w: totalW * 0.3 - 12, h: totalH * 0.45 - 6, type: 'kpi_list', title: '实时状态监控' },
    ];
  }

  // Default layout
  return [
    { x: left, y: top, w: totalW * 0.58, h: totalH * 0.5, type: 'line', title: '核心指标趋势' },
    { x: left + totalW * 0.58 + 6, y: top, w: totalW * 0.42 - 6, h: totalH * 0.5, type: 'bar', title: '分类数据统计' },
    { x: left, y: top + totalH * 0.5 + 6, w: totalW * 0.28, h: totalH * 0.5 - 6, type: 'gauge', title: '运行效率' },
    { x: left + totalW * 0.28 + 6, y: top + totalH * 0.5 + 6, w: totalW * 0.36, h: totalH * 0.5 - 6, type: 'pie', title: '状态分布' },
    { x: left + totalW * 0.64 + 12, y: top + totalH * 0.5 + 6, w: totalW * 0.36 - 12, h: totalH * 0.5 - 6, type: 'kpi_list', title: '关键指标概览' },
  ];
}

/* ──────────────────────── Custom Layout Components ──────────────────────── */

function AgvTwinLayout({ s, VW, VH, glowId }: any) {
  return (
    <g>
      <rect x="0" y="40" width={VW} height={VH - 40} fill="rgba(0,0,0,0.6)" />
      
      {/* Central map paths */}
      <g stroke={s.grid} strokeWidth="2" opacity="0.4" fill="none">
        <path d={`M ${VW*0.2} ${VH*0.3} L ${VW*0.8} ${VH*0.3} L ${VW*0.8} ${VH*0.7} L ${VW*0.2} ${VH*0.7} Z`} />
        <path d={`M ${VW*0.5} ${VH*0.3} L ${VW*0.5} ${VH*0.7}`} />
      </g>
      
      {/* Moving nodes with fading trails */}
      <g>
        <path d={`M ${VW*0.3 - 20} ${VH*0.3} L ${VW*0.3} ${VH*0.3}`} stroke={s.primary} strokeWidth="3" opacity="0.3" />
        <circle cx={VW*0.3} cy={VH*0.3} r="5" fill={s.primary} filter={`url(#${glowId})`} />
        
        <path d={`M ${VW*0.8} ${VH*0.6 + 20} L ${VW*0.8} ${VH*0.6}`} stroke={s.accent} strokeWidth="3" opacity="0.3" />
        <circle cx={VW*0.8} cy={VH*0.6} r="5" fill={s.accent} filter={`url(#${glowId})`} />
      </g>
      
      <text x={VW/2} y={VH/2} textAnchor="middle" fill={s.text} fontSize="20" fontWeight="bold" opacity="0.5">[3D Canvas]</text>
      
      {/* Floating KPI cards */}
      <rect x="20" y="60" width="120" height="80" rx="4" fill="rgba(0,0,0,0.5)" stroke={s.border} strokeWidth="1" opacity="0.8" />
      <text x="30" y="80" fill={s.text} fontSize="10">Active AGVs</text>
      <text x="30" y="110" fill={s.primary} fontSize="24" fontWeight="bold" filter={`url(#${glowId})`}>42</text>
      
      <rect x={VW - 140} y="60" width="120" height="80" rx="4" fill="rgba(0,0,0,0.5)" stroke={s.border} strokeWidth="1" opacity="0.8" />
      <text x={VW - 130} y="80" fill={s.text} fontSize="10">System Status</text>
      <text x={VW - 130} y="110" fill={s.accent} fontSize="24" fontWeight="bold" filter={`url(#${glowId})`}>99.9%</text>
    </g>
  );
}

function PlcTopologyLayout({ s, VW, VH, glowId }: any) {
  return (
    <g>
      {/* Main panel */}
      <rect x="20" y="60" width={VW - 40} height={VH - 80} rx="4" fill="rgba(0,0,0,0.4)" stroke={s.border} strokeWidth="1" />
      
      {/* Connection lines */}
      <g stroke={s.primary} strokeWidth="1.5" opacity="0.6">
        <line x1={VW/2} y1="120" x2={VW/4} y2="240" />
        <line x1={VW/2} y1="120" x2={VW*3/4} y2="240" />
        <line x1={VW/4} y1="240" x2={VW/6} y2="360" />
        <line x1={VW/4} y1="240" x2={VW/3} y2="360" />
      </g>
      
      {/* Nodes */}
      {[
        { x: VW/2, y: 120, label: 'Main PLC', status: 'ok' },
        { x: VW/4, y: 240, label: 'Sub PLC A', status: 'ok' },
        { x: VW*3/4, y: 240, label: 'Sub PLC B', status: 'error' },
        { x: VW/6, y: 360, label: 'Node 1', status: 'ok' },
        { x: VW/3, y: 360, label: 'Node 2', status: 'ok' },
      ].map((node, i) => (
        <g key={i}>
          <rect x={node.x - 40} y={node.y - 20} width="80" height="40" rx="4" fill="rgba(0,0,0,0.8)" stroke={node.status === 'ok' ? '#22c55e' : '#ef4444'} strokeWidth="1.5" filter={`url(#${glowId})`} />
          <circle cx={node.x - 25} cy={node.y} r="4" fill={node.status === 'ok' ? '#22c55e' : '#ef4444'} />
          <text x={node.x - 15} y={node.y + 3} fill={s.text} fontSize="9">{node.label}</text>
        </g>
      ))}
      
      {/* Heartbeat / Latency */}
      <text x={VW/2 + 20} y="180" fill={s.text} fontSize="10" opacity="0.7">Latency: 12ms</text>
      <text x={VW*5/8 + 20} y="180" fill={s.text} fontSize="10" opacity="0.7">Latency: 45ms</text>
    </g>
  );
}

function ChassisMonitorLayout({ s, VW, VH, glowId }: any) {
  return (
    <g>
      {/* Left Wireframe */}
      <rect x="20" y="60" width={VW/2 - 30} height={VH - 80} rx="4" fill="rgba(0,0,0,0.3)" stroke={s.grid} strokeWidth="1" />
      <g stroke={s.primary} strokeWidth="1.5" fill="none" transform={`translate(80, 150)`}>
        <polygon points="0,50 100,0 200,50 100,100" opacity="0.8" />
        <polygon points="0,150 100,100 200,150 100,200" opacity="0.4" />
        <line x1="0" y1="50" x2="0" y2="150" opacity="0.6" />
        <line x1="100" y1="100" x2="100" y2="200" opacity="0.6" />
        <line x1="200" y1="50" x2="200" y2="150" opacity="0.6" />
        <line x1="100" y1="0" x2="100" y2="100" opacity="0.6" />
        
        {/* Glow point */}
        <circle cx="100" cy="150" r="5" fill={s.accent} filter={`url(#${glowId})`} stroke="none" />
      </g>
      
      {/* Right Parameters & Logs */}
      <rect x={VW/2 + 10} y="60" width={VW/2 - 30} height={(VH - 80)/2 - 10} rx="4" fill="rgba(0,0,0,0.3)" stroke={s.grid} strokeWidth="1" />
      <text x={VW/2 + 20} y="80" fill={s.text} fontSize="12" fontWeight="bold">Parameters</text>
      {[
        { k: 'Voltage', v: '48.2 V' },
        { k: 'Current', v: '12.4 A' },
        { k: 'Temperature', v: '38 °C' },
        { k: 'Motor RPM', v: '3000' },
      ].map((p, i) => (
        <g key={i}>
          <text x={VW/2 + 20} y={110 + i * 20} fill={s.text} fontSize="10" opacity="0.7">{p.k}</text>
          <text x={VW - 40} y={110 + i * 20} fill={s.primary} fontSize="10" textAnchor="end">{p.v}</text>
        </g>
      ))}
      
      <rect x={VW/2 + 10} y={60 + (VH - 80)/2 + 10} width={VW/2 - 30} height={(VH - 80)/2 - 10} rx="4" fill="rgba(0,0,0,0.3)" stroke={s.grid} strokeWidth="1" />
      <text x={VW/2 + 20} y={60 + (VH - 80)/2 + 30} fill={s.text} fontSize="12" fontWeight="bold">[Alarm Logs]</text>
      {[
        'WARN: Temp sensor 2 reading high',
        'INFO: Calibration complete',
        'ERR: Comm timeout node 4',
      ].map((log, i) => (
        <text key={i} x={VW/2 + 20} y={60 + (VH - 80)/2 + 60 + i * 20} fill={log.startsWith('ERR') ? '#ef4444' : log.startsWith('WARN') ? '#f59e0b' : s.text} fontSize="9" opacity="0.8">
          {log}
        </text>
      ))}
    </g>
  );
}

function GeneralDashboardLayout({ s, VW, VH, glowId }: any) {
  return (
    <g>
      {[
        { x: 20, y: 60, w: 200, h: 100 },
        { x: 230, y: 60, w: VW - 250, h: 220 },
        { x: 20, y: 170, w: 200, h: 270 },
        { x: 230, y: 290, w: (VW - 260)/2, h: 150 },
        { x: 230 + (VW - 260)/2 + 10, y: 290, w: (VW - 260)/2, h: 150 },
      ].map((box, i) => (
        <g key={i}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="2" fill="rgba(0,0,0,0.4)" stroke={s.border} strokeWidth="0.5" />
          <path d={`M ${box.x} ${box.y + 10} L ${box.x} ${box.y} L ${box.x + 10} ${box.y}`} fill="none" stroke={s.primary} strokeWidth="2" />
          <path d={`M ${box.x + box.w} ${box.y + 10} L ${box.x + box.w} ${box.y} L ${box.x + box.w - 10} ${box.y}`} fill="none" stroke={s.primary} strokeWidth="2" />
          <text x={box.x + box.w/2} y={box.y + box.h/2} textAnchor="middle" fill={s.text} fontSize="12" opacity="0.5">{i % 2 === 0 ? '[JSON Data Slot]' : '[Widget]'}</text>
        </g>
      ))}
    </g>
  );
}
