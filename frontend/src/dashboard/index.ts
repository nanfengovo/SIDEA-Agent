export type { DashboardDslV2, LayoutItem, WidgetId } from './types';
export { isDashboardDslV2, validateDslV2, DSL_VERSION } from './types';
export { legacyPanelsToDslV2 } from './compat';
export { WIDGET_REGISTRY, resolveWidget, listRegisteredWidgets } from './registry';
export { DashboardV2 } from './DashboardV2';
export { DashboardV2Shell } from './DashboardV2Shell';
