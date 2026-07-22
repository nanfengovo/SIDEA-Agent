import type { ComponentType } from 'react';
import type { WidgetId, WidgetRenderProps } from './types';
import { DashboardHeaderWidget, KpiStripWidget } from './widgets/HeaderKpi';
import {
  AmrFloorMapWidget,
  Bar3dLoadWidget,
  CustomEchartsWidget,
  GaugePairWidget,
  StatusDonutWidget,
  TrendComboWidget,
} from './widgets/Charts';
import { Amr3DMapWidget } from './widgets/Amr3DMap';

export const WIDGET_REGISTRY: Record<string, ComponentType<WidgetRenderProps>> = {
  dashboard_header: DashboardHeaderWidget,
  kpi_strip: KpiStripWidget,
  gauge_pair: GaugePairWidget,
  trend_combo: TrendComboWidget,
  status_donut: StatusDonutWidget,
  amr_floor_map: AmrFloorMapWidget,
  amr_iso_map: Amr3DMapWidget,
  bar3d_load: Bar3dLoadWidget,
  custom_echarts: CustomEchartsWidget,
};

export function resolveWidget(id: WidgetId | string): ComponentType<WidgetRenderProps> {
  return WIDGET_REGISTRY[id] || CustomEchartsWidget;
}

export function listRegisteredWidgets(): string[] {
  return Object.keys(WIDGET_REGISTRY);
}
