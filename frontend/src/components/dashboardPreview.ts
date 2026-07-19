export type DashboardPreviewPanel = {
  id?: string;
  title?: string;
  option: any;
};

const STORAGE_PREFIX = 'sidea_dashboard_preview:';

export type DashboardPreviewPayload = {
  title?: string;
  panels: DashboardPreviewPanel[];
  theme: 'dark' | 'light' | string;
};

export function saveDashboardPreview(payload: DashboardPreviewPayload): string {
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // 必须用 localStorage：sessionStorage 不跨标签页共享
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(payload));
  return key;
}

export function loadDashboardPreview(key: string): DashboardPreviewPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function openDashboardPreviewTab(payload: DashboardPreviewPayload) {
  const key = saveDashboardPreview(payload);
  const url = `${window.location.origin}${window.location.pathname}#/dashboard-preview?key=${encodeURIComponent(key)}`;
  const tab = window.open(url, '_blank');
  if (!tab) {
    localStorage.removeItem(STORAGE_PREFIX + key);
    throw new Error('blocked');
  }
  setTimeout(() => localStorage.removeItem(STORAGE_PREFIX + key), 30 * 60 * 1000);
  return tab;
}

export function parsePreviewKey(): string | null {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#/dashboard-preview')) return null;
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(q).get('key');
}

export function isDashboardPreviewRoute(): boolean {
  return (window.location.hash || '').startsWith('#/dashboard-preview');
}
