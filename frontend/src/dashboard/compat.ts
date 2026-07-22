import type { DashboardDslV2, LayoutItem } from './types';
import { detectHeroSpan } from '../components/DashboardPanel';

/** Convert legacy Panel Array → DSL v2 (mostly custom_echarts / amr_floor_map). */
export function legacyPanelsToDslV2(legacy: any): DashboardDslV2 | null {
  if (!legacy || legacy.type !== 'dashboard' || !Array.isArray(legacy.panels)) return null;

  const layout: LayoutItem[] = [];
  const data: Record<string, unknown> = {};

  legacy.panels.forEach((p: any, i: number) => {
    if (!p || typeof p !== 'object') return;
    const pid = String(p.id || `p${i}`);
    const ref = `echarts_${pid}`;
    const option = p.option || p;
    data[ref] = { option };
    const span =
      (p.span && p.span.col
        ? { col: Number(p.span.col) || 1, row: Number(p.span.row) || 1 }
        : undefined) || detectHeroSpan(option, pid);

    let widget: string = 'custom_echarts';
    const series = Array.isArray(option?.series) ? option.series : [];
    const mapLike = series.some(
      (s: any) =>
        s?.type === 'effectScatter' || s?.type === 'lines' || (s?.markArea && typeof s.markArea === 'object')
    );
    if (mapLike) widget = 'amr_floor_map';

    layout.push({
      id: pid,
      widget,
      data_ref: ref,
      title: typeof p.title === 'string' ? p.title : undefined,
      title_en: typeof p.title_en === 'string' ? p.title_en : undefined,
      span,
    });
  });

  if (!layout.length) return null;

  // Prefer named template when present; otherwise freeform grid
  const template =
    typeof legacy.template === 'string' && legacy.template
      ? legacy.template
      : layout.some((x) => x.widget === 'amr_floor_map')
        ? 'tpl_cockpit_ceo_1'
        : 'gen_glassmorphic_light';

  return {
    type: 'dashboard',
    dsl_version: 2,
    title: String(legacy.title || '工业监控大屏'),
    title_en: legacy.title_en ? String(legacy.title_en) : undefined,
    template,
    theme: 'dark-industrial',
    layout,
    data,
    insights: Array.isArray(legacy.insights) ? legacy.insights.map(String) : [],
    i18n: legacy.i18n && typeof legacy.i18n === 'object' ? legacy.i18n : {},
    _meta: { converted_from: 'legacy_panels' },
  };
}
