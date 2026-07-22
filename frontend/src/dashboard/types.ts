/** Dashboard DSL v2 — declarative widget + data contract. */

export const DSL_VERSION = 2 as const;

export type WidgetId =
  | 'dashboard_header'
  | 'kpi_strip'
  | 'gauge_pair'
  | 'trend_combo'
  | 'status_donut'
  | 'amr_floor_map'
  | 'amr_iso_map'
  | 'bar3d_load'
  | 'custom_echarts';

export type DashboardTemplateId = string;

export type WidgetSpan = { col: number; row: number };

export type LayoutItem = {
  id: string;
  widget: WidgetId | string;
  data_ref: string;
  title?: string;
  title_en?: string;
  slot?: string;
  span?: WidgetSpan;
  props?: Record<string, unknown>;
};

export type KpiItem = {
  label: string;
  label_en?: string;
  value: string | number;
  delta?: string;
  tone?: 'cyan' | 'green' | 'amber' | 'blue' | 'red' | string;
};

export type HeaderData = {
  subtitle?: string;
  status?: 'live' | 'simulated' | string;
  clock?: boolean;
};

export type FloorRobot = {
  id: string;
  x: number;
  y: number;
  status: 'busy' | 'idle' | 'charging' | 'fault' | string;
};

export type FloorZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FloorData = {
  zones: FloorZone[];
  robots: FloorRobot[];
  routes?: { id?: string; coords: number[][] }[];
  /** Escape hatch: prebuilt ECharts option from legacy conversion */
  option?: unknown;
};

export type GaugePairData = {
  left: { label: string; label_en?: string; value: number };
  right: { label: string; label_en?: string; value: number };
};

export type StatusSlice = {
  name: string;
  name_en?: string;
  value: number;
  color?: string;
};

export type TrendComboData = {
  x: string[];
  series: Array<{
    name: string;
    name_en?: string;
    type: 'bar' | 'line';
    data: number[];
    yAxisIndex?: number;
  }>;
};

export type CustomEchartsData = {
  option: unknown;
};

export type DashboardDslV2 = {
  type: 'dashboard';
  dsl_version: 2;
  title: string;
  title_en?: string;
  template: DashboardTemplateId | string;
  theme?: string;
  layout: LayoutItem[];
  data: Record<string, unknown>;
  insights?: string[];
  i18n?: Record<string, Record<string, string>>;
  _meta?: Record<string, unknown>;
};

export type WidgetRenderProps = {
  item: LayoutItem;
  data: unknown;
  theme: string;
  language: string;
  height: string;
  title?: string;
};

export function isDashboardDslV2(doc: unknown): doc is DashboardDslV2 {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  return (
    d.type === 'dashboard' &&
    Number(d.dsl_version) === 2 &&
    Array.isArray(d.layout) &&
    d.data !== null &&
    typeof d.data === 'object'
  );
}

export function validateDslV2(doc: DashboardDslV2): { ok: boolean; reason: string } {
  if (!doc.layout?.length) return { ok: false, reason: 'layout empty' };
  if (!doc.data || typeof doc.data !== 'object') return { ok: false, reason: 'data missing' };
  for (let i = 0; i < doc.layout.length; i++) {
    const item = doc.layout[i];
    if (!item.widget) return { ok: false, reason: `layout[${i}].widget required` };
    if (!item.data_ref) return { ok: false, reason: `layout[${i}].data_ref required` };
    if (!(item.data_ref in doc.data)) {
      return { ok: false, reason: `data missing '${item.data_ref}'` };
    }
  }
  return { ok: true, reason: 'ok' };
}
