import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import 'echarts-gl';
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
import { openDashboardPreviewTab } from './dashboardPreview';
import { simplifiedToTraditional } from './langUtils';

export type DashboardPanelItem = {
  id?: string;
  title?: string;
  option: any;
  /** 版面跨度：地图类中心面板占更大区域，模拟参考大屏的「中央大图」 */
  span?: { col: number; row: number };
};

/** 识别「厂区地图/机器人实时位置」这类中心面板：含 markArea 分区 + 机器人散点 */
export function detectHeroSpan(option: any, id?: string): { col: number; row: number } | undefined {
  try {
    const series = Array.isArray(option?.series) ? option.series : [];
    const hasMarkArea = series.some((s: any) => s?.markArea);
    const hasEffect = series.some((s: any) => s?.type === 'effectScatter');
    const hasLines = series.some((s: any) => s?.type === 'lines');
    const idHit = /floor|map|amr/i.test(String(id || ''));
    if ((hasMarkArea && (hasEffect || hasLines)) || (idHit && hasEffect)) {
      return { col: 2, row: 2 };
    }
  } catch {
    /* noop */
  }
  return undefined;
}

export type NormalizedDashboard = {
  kind: 'dashboard';
  title?: string;
  panels: DashboardPanelItem[];
  raw?: any;
};

/** Resolve i18n placeholders: bare keys (T_TITLE) or braced ({T_TITLE}). */
export function applyI18n(obj: any, dict: Record<string, string>): any {
  if (typeof obj === 'string') {
    if (dict[obj] !== undefined) return dict[obj];
    return obj.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (m, key) => (dict[key] !== undefined ? dict[key] : m));
  }
  if (Array.isArray(obj)) return obj.map((v) => applyI18n(v, dict));
  if (obj !== null && typeof obj === 'object') {
    const next: any = {};
    for (const key in obj) next[key] = applyI18n(obj[key], dict);
    return next;
  }
  return obj;
}

export function resolveLangKey(language: string): 'zh-CN' | 'en' {
  const lang = (language || '').toLowerCase();
  // 日文/英文 → en 词典；简中/繁中 → zh-CN 词典（繁体在 deepLocalize 再做简转繁）
  if (
    lang.startsWith('en') ||
    lang.includes('english') ||
    lang.includes('日本') ||
    lang.includes('japan') ||
    lang === 'ja' ||
    lang.startsWith('ja-')
  ) {
    return 'en';
  }
  if (lang.startsWith('zh') || lang.includes('中文') || lang.includes('简') || lang.includes('繁')) {
    return 'zh-CN';
  }
  return 'en';
}

function wantsTraditional(language: string): boolean {
  const lang = language || '';
  return /繁|zh-tw|zh-hk|zh-hant/i.test(lang);
}

export function pickI18nDict(i18nBlock: any, language: string): Record<string, string> {
  if (!i18nBlock || typeof i18nBlock !== 'object') return {};
  const currentLang = resolveLangKey(language);
  return i18nBlock[currentLang] || i18nBlock['zh-CN'] || i18nBlock['en'] || {};
}

/** 工业术语中英词典：模型漏传 *_en 时的前端兜底翻译。 */
const ZH_EN_GLOSSARY: Record<string, string> = {
  '车间实时数字孪生监控大屏': 'Workshop Real-time Digital Twin Dashboard',
  '产能与缺陷追踪': 'Capacity & Defect Tracking',
  '工艺能耗分布': 'Process Energy Consumption',
  '刀具磨损寿命预测': 'Tool Wear Life Prediction',
  '刀具磨损预测': 'Tool Wear Prediction',
  '核心三轴温度阵列': 'Core 3-Axis Temperature Array',
  '核心温度阵列': 'Core Temperature Array',
  '高危预警': 'High Risk',
  '暂无数据点': 'No data points',
  '次品率': 'Defect Rate',
  '磨损度': 'Wear',
  '监控大屏': 'Dashboard',
  '数字孪生': 'Digital Twin',
  '产能': 'Capacity',
  '产量': 'Output',
  '良率': 'Yield',
  '冲压': 'Stamping',
  '焊接': 'Welding',
  '喷涂': 'Painting',
  '总装': 'Assembly',
  '时长': 'Duration',
  '正常': 'Normal',
  '温度': 'Temperature',
  '能耗': 'Energy',
  '车间': 'Workshop',
  '机床': 'Machine',
  '实时': 'Real-time',
};

const GLOSSARY_KEYS = Object.keys(ZH_EN_GLOSSARY).sort((a, b) => b.length - a.length);

function translateZhToEn(text: string): string {
  if (ZH_EN_GLOSSARY[text]) return ZH_EN_GLOSSARY[text];
  let out = text;
  for (const zh of GLOSSARY_KEYS) {
    if (out.includes(zh)) out = out.split(zh).join(ZH_EN_GLOSSARY[zh]);
  }
  return out;
}

/** Strip bilingual leftovers like "产能 (Capacity)" when UI language is zh/en. */
function localizeHardcodedBilingual(text: string, language: string): string {
  if (typeof text !== 'string') return text;
  const isZh = resolveLangKey(language) === 'zh-CN';
  // "中文 (English)" or "中文（English）"
  const m1 = text.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (m1) {
    const left = m1[1].trim();
    const right = m1[2].trim();
    const leftLooksZh = /[\u4e00-\u9fff]/.test(left);
    const rightLooksZh = /[\u4e00-\u9fff]/.test(right);
    const rightIsUnit = !/[A-Za-z\u4e00-\u9fff]{2,}/.test(right); // "(%)"、"(℃)" 这类单位后缀
    if (leftLooksZh && !rightLooksZh) {
      if (rightIsUnit) return `${isZh ? left : translateZhToEn(left)} (${right})`;
      return isZh ? left : right;
    }
    if (!leftLooksZh && rightLooksZh) return isZh ? right : left;
  }
  // 英文模式下残留纯中文：走词典兜底翻译
  if (!isZh && /[\u4e00-\u9fff]/.test(text)) return translateZhToEn(text);
  return text;
}

function finalizeLocalizedString(text: string, language: string): string {
  let s = localizeHardcodedBilingual(text, language);
  if (wantsTraditional(language) && /[\u4e00-\u9fff]/.test(s)) {
    s = simplifiedToTraditional(s);
  }
  return s;
}

function deepLocalizeStrings(obj: any, language: string): any {
  if (typeof obj === 'string') return finalizeLocalizedString(obj, language);
  if (Array.isArray(obj)) return obj.map((v) => deepLocalizeStrings(v, language));
  if (obj !== null && typeof obj === 'object') {
    const next: any = {};
    for (const key in obj) next[key] = deepLocalizeStrings(obj[key], language);
    return next;
  }
  return obj;
}

export function normalizeChartPayload(
  parsed: any,
  language: string
): { kind: 'single'; option: any; raw?: any } | NormalizedDashboard | null {
  if (!parsed) return null;

  if (parsed.type === 'dashboard' && Array.isArray(parsed.panels) && parsed.panels.length > 0) {
    const dict = pickI18nDict(parsed.i18n, language);
    const title = typeof parsed.title === 'string' ? applyI18n(parsed.title, dict) : undefined;
    const panels = parsed.panels.map((p: any, idx: number) => {
      const rawOpt = p.option || p;
      const panelDict = p.i18n ? { ...dict, ...pickI18nDict(p.i18n, language) } : dict;
      const localizedOpt = deepLocalizeStrings(applyI18n(rawOpt, panelDict), language);
      return {
        id: p.id || `p${idx}`,
        title: p.title ? finalizeLocalizedString(String(applyI18n(p.title, panelDict)), language) : undefined,
        option: localizedOpt,
        span: (p.span && p.span.col ? { col: Number(p.span.col) || 1, row: Number(p.span.row) || 1 } : undefined)
          || detectHeroSpan(localizedOpt, p.id),
      };
    });
    return {
      kind: 'dashboard',
      title: title ? finalizeLocalizedString(String(title), language) : undefined,
      panels,
      raw: parsed,
    };
  }

  if (parsed.i18n && parsed.option) {
    const dict = pickI18nDict(parsed.i18n, language);
    return {
      kind: 'single',
      option: deepLocalizeStrings(applyI18n(parsed.option, dict), language),
      raw: parsed,
    };
  }

  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    (parsed[0].series || parsed[0].xAxis || parsed[0].radar || parsed[0].option || parsed[0].grid3D)
  ) {
    return {
      kind: 'dashboard',
      panels: parsed.map((chartItem: any, idx: number) => {
        const chartOpt = chartItem.option || chartItem;
        const dict = chartItem.i18n ? pickI18nDict(chartItem.i18n, language) : {};
        const opt = Object.keys(dict).length ? applyI18n(chartOpt, dict) : chartOpt;
        return {
          id: chartItem.id || `p${idx}`,
          title: chartItem.title
            ? finalizeLocalizedString(String(applyI18n(chartItem.title, dict)), language)
            : undefined,
          option: deepLocalizeStrings(opt, language),
        };
      }),
      raw: parsed,
    };
  }

  if (parsed.series || parsed.xAxis || parsed.radar || parsed.grid3D) {
    return { kind: 'single', option: deepLocalizeStrings(parsed, language), raw: parsed };
  }

  return null;
}

type ThemeTokens = {
  text: string;
  muted: string;
  axis: string;
  split: string;
  border: string;
  panelBg: string;
  shellBg: string;
  accent: string;
};

function themeTokens(theme: string): ThemeTokens {
  const isDark = theme === 'dark';
  return {
    text: isDark ? '#e2e8f0' : '#0f172a',
    muted: isDark ? '#94a3b8' : '#64748b',
    axis: isDark ? '#94a3b8' : '#64748b',
    split: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.18)',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
    panelBg: isDark ? 'rgba(17,17,24,0.72)' : 'rgba(255,255,255,0.92)',
    shellBg: isDark ? 'rgba(11,15,26,0.92)' : 'rgba(248,250,252,0.96)',
    accent: isDark ? '#22d3ee' : '#0891b2',
  };
}

const DARK_PALETTE = ['#22d3ee', '#3b82f6', '#a78bfa', '#34d399', '#fbbf24', '#f97316', '#38bdf8', '#fb7185'];
const LIGHT_PALETTE = ['#0891b2', '#2563eb', '#7c3aed', '#059669', '#d97706', '#ea580c', '#0284c7', '#e11d48'];

/** Rewrite hardcoded chart text/axis colors so panels follow app theme. */
export function applyThemeToOption(option: any, theme: string, language?: string): any {
  if (!option || typeof option !== 'object') return option;
  const isZh = resolveLangKey(language || 'zh') === 'zh-CN';
  const isDarkTheme = theme === 'dark';
  const t = themeTokens(theme);
  const cloned = JSON.parse(JSON.stringify(option));

  const paintAxis = (axis: any) => {
    if (!axis) return;
    const list = Array.isArray(axis) ? axis : [axis];
    list.forEach((a) => {
      a.axisLabel = { ...(a.axisLabel || {}), color: t.axis };
      a.nameTextStyle = { ...(a.nameTextStyle || {}), color: t.muted };
      a.axisLine = {
        ...(a.axisLine || {}),
        lineStyle: { ...((a.axisLine && a.axisLine.lineStyle) || {}), color: t.border },
      };
      if (a.splitLine !== false) {
        a.splitLine = {
          ...(typeof a.splitLine === 'object' ? a.splitLine : {}),
          lineStyle: {
            ...((typeof a.splitLine === 'object' && a.splitLine.lineStyle) || {}),
            color: t.split,
          },
        };
      }
    });
  };

  cloned.backgroundColor = 'transparent';
  if (cloned.title) {
    if (typeof cloned.title === 'string') {
      cloned.title = { text: cloned.title, textStyle: { color: t.text } };
    } else {
      const titles = Array.isArray(cloned.title) ? cloned.title : [cloned.title];
      titles.forEach((title: any) => {
        if (title && typeof title === 'object') {
          title.textStyle = { ...(title.textStyle || {}), color: t.text };
        }
      });
    }
  }
  if (cloned.legend) {
    const legends = Array.isArray(cloned.legend) ? cloned.legend : [cloned.legend];
    legends.forEach((legend: any) => {
      if (legend && typeof legend === 'object') {
        legend.textStyle = { ...(legend.textStyle || {}), color: t.muted };
      }
    });
  }
  paintAxis(cloned.xAxis);
  paintAxis(cloned.yAxis);

  // 小面板防裁切/防重叠：
  // 1) 图例里已有的名字不再重复画在 y 轴顶部（双 Y combo 里两者会叠在一起）
  // 2) x 轴名挪到轴下方居中，避免贴右边被裁掉
  const legendNames = new Set<string>();
  if (cloned.legend) {
    const legends = Array.isArray(cloned.legend) ? cloned.legend : [cloned.legend];
    legends.forEach((lg: any) => (lg.data || []).forEach((d: any) => legendNames.add(typeof d === 'string' ? d : d?.name)));
  }
  if (Array.isArray(cloned.series)) {
    cloned.series.forEach((s: any) => {
      if (s?.name) legendNames.add(s.name);
      if (s?.type === 'pie' && Array.isArray(s.data)) s.data.forEach((d: any) => d?.name && legendNames.add(d.name));
    });
  }
  const dedupeAxisName = (axis: any) => {
    const list = Array.isArray(axis) ? axis : axis ? [axis] : [];
    list.forEach((a) => {
      if (a?.name && legendNames.has(a.name)) delete a.name;
    });
  };
  if (cloned.legend) {
    dedupeAxisName(cloned.yAxis);
  }
  const xList = Array.isArray(cloned.xAxis) ? cloned.xAxis : cloned.xAxis ? [cloned.xAxis] : [];
  xList.forEach((a: any) => {
    if (a?.name && a.type === 'value' && !a.nameLocation) {
      a.nameLocation = 'middle';
      a.nameGap = 26;
    }
  });

  // 饼图排版随类别数自适应（不丢数据）：
  //   ≤4 类：右侧竖排图例；5 类以上：底部滚动图例 + 环图居中；
  //   小扇区（<3%）不画内部百分比标签，minAngle 保证细扇区可见。
  if (Array.isArray(cloned.series)) {
    cloned.series.forEach((s: any) => {
      if (s?.type !== 'pie') return;
      const rows = Array.isArray(s.data) ? s.data : [];
      const total = rows.reduce(
        (sum: number, d: any) => sum + (typeof d === 'object' ? Number(d?.value) || 0 : Number(d) || 0),
        0,
      ) || 1;
      s.data = rows.map((d: any) => {
        if (typeof d !== 'object' || d === null) return d;
        const frac = (Number(d.value) || 0) / total;
        return frac < 0.03 ? { ...d, label: { ...(d.label || {}), show: false } } : d;
      });
      s.minAngle = s.minAngle ?? 3;
      s.label = {
        ...(s.label || {}),
        position: 'inside',
        formatter: '{d}%',
        fontSize: 10,
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowBlur: 4,
      };
      s.labelLine = { show: false };
      if (rows.length > 4) {
        s.center = ['50%', '48%'];
        s.radius = ['30%', '52%'];
      }
    });

    const pieLens = cloned.series
      .filter((s: any) => s?.type === 'pie')
      .map((s: any) => (Array.isArray(s.data) ? s.data.length : 0));
    const pieCount = pieLens.length ? Math.max(...pieLens) : 0;
    if (pieCount > 4) {
      const legendObj = {
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        type: 'scroll',
        pageIconColor: '#22d3ee',
        pageTextStyle: { color: t.muted },
        textStyle: { color: t.muted, fontSize: 10 },
      };
      if (!cloned.legend) cloned.legend = legendObj;
      else if (Array.isArray(cloned.legend)) cloned.legend = cloned.legend.map(() => ({ ...legendObj }));
      else cloned.legend = { ...cloned.legend, ...legendObj };
    } else if (cloned.legend) {
      const legends = Array.isArray(cloned.legend) ? cloned.legend : [cloned.legend];
      legends.forEach((legend: any) => {
        legend.textStyle = { ...(legend.textStyle || {}), color: t.muted };
      });
    }
  } else if (cloned.legend) {
    const legends = Array.isArray(cloned.legend) ? cloned.legend : [cloned.legend];
    legends.forEach((legend: any) => {
      legend.textStyle = { ...(legend.textStyle || {}), color: t.muted };
    });
  }

  if (cloned.visualMap) {
    const maps = Array.isArray(cloned.visualMap) ? cloned.visualMap : [cloned.visualMap];
    maps.forEach((vm: any) => {
      vm.textStyle = { ...(vm.textStyle || {}), color: t.muted };
    });
  }

  if (Array.isArray(cloned.series)) {
    // 已生成的空散点图：前端兜底补点，避免四宫格出现空白面板导致边框错位观感
    const scatterSeries = cloned.series.filter((s: any) => s?.type === 'scatter');
    const scatterEmpty =
      scatterSeries.length > 0 &&
      scatterSeries.every((s: any) => !Array.isArray(s.data) || s.data.length === 0);
    if (scatterEmpty) {
      const demo: number[][] = [];
      for (let i = 0; i < 16; i++) {
        demo.push([10 + i * 5, 20 + i * 4 + (i % 3) * 3]);
      }
      const warn = demo.filter((p) => p[1] >= 80);
      const ok = demo.filter((p) => p[1] < 80);
      cloned.series = [
        {
          name: scatterSeries[0]?.name || (isZh ? '正常' : 'Normal'),
          type: 'scatter',
          data: ok,
          symbolSize: 10,
          itemStyle: { color: theme === 'dark' ? '#22d3ee' : '#0284c7' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ef4444', type: 'dashed', width: 2 },
            data: [{ yAxis: 80 }],
            label: { formatter: 'WARN', position: 'insideEndTop', color: '#ef4444' },
          },
        },
        {
          name: isZh ? '高危预警' : 'High Risk',
          type: 'scatter',
          data: warn,
          symbolSize: 14,
          itemStyle: { color: '#ef4444' },
        },
      ];
    }

    // markLine 的 "WARN" 标签默认画在网格右侧外面，小面板会被裁掉一半
    cloned.series.forEach((s: any) => {
      if (s?.markLine?.label) {
        s.markLine.label = { position: 'insideEndTop', ...s.markLine.label };
        if (s.markLine.label.position === 'end') s.markLine.label.position = 'insideEndTop';
      }
    });

    cloned.series.forEach((s: any) => {
      if (s.label && typeof s.label === 'object') {
        s.label = { ...s.label, color: s.label.color || t.text };
      }
      if (s.type === 'scatter' && (!s.itemStyle || !s.itemStyle.color)) {
        s.itemStyle = {
          ...(s.itemStyle || {}),
          color: theme === 'dark' ? '#22d3ee' : '#0284c7',
          symbolSize: s.symbolSize || 10,
        };
      }
    });
  }

  // ---- 大屏视觉增强：统一调色板 / 渐变柱 / 面积光晕 / 玻璃提示框 ----
  const palette = isDarkTheme ? DARK_PALETTE : LIGHT_PALETTE;
  if (!cloned.color) cloned.color = palette;

  const hexToRgba = (hex: string, alpha: number): string | null => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
  };
  const vGradient = (base: string, topAlpha: number, bottomAlpha: number) => {
    const top = hexToRgba(base, topAlpha);
    const bottom = hexToRgba(base, bottomAlpha);
    if (!top || !bottom) return base;
    return {
      type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: top },
        { offset: 1, color: bottom },
      ],
    };
  };

  const seriesList = Array.isArray(cloned.series) ? cloned.series : [];
  const has3D = !!cloned.grid3D;
  const hasCartesian = seriesList.some((s: any) => ['bar', 'line', 'scatter'].includes(s?.type));

  if (!has3D) {
    seriesList.forEach((s: any, idx: number) => {
      const base =
        (typeof s?.itemStyle?.color === 'string' && s.itemStyle.color.startsWith('#') && s.itemStyle.color) ||
        (typeof cloned.color?.[idx % cloned.color.length] === 'string' && cloned.color[idx % cloned.color.length]) ||
        palette[idx % palette.length];

      if (s?.type === 'bar') {
        s.barMaxWidth = s.barMaxWidth ?? 26;
        s.itemStyle = {
          ...(s.itemStyle || {}),
          borderRadius: s.itemStyle?.borderRadius ?? [5, 5, 0, 0],
          color: vGradient(base, 0.95, 0.25),
        };
      }
      if (s?.type === 'line') {
        s.smooth = s.smooth ?? true;
        s.symbol = s.symbol ?? 'circle';
        s.symbolSize = s.symbolSize ?? 5;
        s.lineStyle = { width: 2.5, ...(s.lineStyle || {}) };
        if (!s.areaStyle && seriesList.filter((x: any) => x?.type === 'line').length <= 3) {
          s.areaStyle = { color: vGradient(base, 0.28, 0.02) };
        }
      }
    });

    if (hasCartesian) {
      cloned.tooltip = {
        trigger: seriesList.some((s: any) => s?.type === 'bar' || s?.type === 'line') ? 'axis' : 'item',
        ...(cloned.tooltip || {}),
        backgroundColor: isDarkTheme ? 'rgba(8,14,26,0.9)' : 'rgba(255,255,255,0.96)',
        borderColor: isDarkTheme ? 'rgba(34,211,238,0.35)' : 'rgba(8,145,178,0.3)',
        borderWidth: 1,
        textStyle: { color: t.text, fontSize: 12 },
        axisPointer: {
          type: 'line',
          lineStyle: { color: isDarkTheme ? 'rgba(34,211,238,0.4)' : 'rgba(8,145,178,0.35)' },
          ...(cloned.tooltip?.axisPointer || {}),
        },
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,0.35); border-radius: 10px;',
      };
      // 收紧默认留白，让图表吃满面板
      if (!cloned.grid) {
        cloned.grid = { top: 42, left: 12, right: 16, bottom: 10, containLabel: true };
      }
    }
  }

  // 3D 面板给足视口，避免坐标轴贴边被裁切
  if (cloned.grid3D && typeof cloned.grid3D === 'object') {
    cloned.grid3D = {
      ...cloned.grid3D,
      top: cloned.grid3D.top ?? 24,
      bottom: cloned.grid3D.bottom ?? 16,
      left: cloned.grid3D.left ?? 0,
      right: cloned.grid3D.right ?? 0,
      boxWidth: cloned.grid3D.boxWidth ?? 160,
      boxDepth: cloned.grid3D.boxDepth ?? 120,
      boxHeight: cloned.grid3D.boxHeight ?? 80,
    };
  }

  return cloned;
}

function extractSeriesData(panels: DashboardPanelItem[]) {
  return panels.map((p, idx) => ({
    id: p.id || `p${idx}`,
    title: p.title || p.option?.title?.text || `Panel ${idx + 1}`,
    series: (Array.isArray(p.option?.series) ? p.option.series : []).map((s: any) => ({
      name: s.name,
      type: s.type,
      data: s.data,
    })),
  }));
}

function buildReplayPrompt(raw: any, title?: string, language?: string): string {
  const isZh = resolveLangKey(language || 'zh') === 'zh-CN';
  const panels = Array.isArray(raw?.panels) ? raw.panels : [];
  const lines = panels.map((p: any, i: number) => {
    const t = p.title || `panel_${i}`;
    const type =
      p.option?.series?.[0]?.type ||
      (p.option?.grid3D ? 'bar3d' : 'unknown');
    return `${i + 1}. ${t} (type≈${type})`;
  });

  if (isZh) {
    return [
      `请使用 run_python_in_sandbox 调用 sidea_sdk.export_dashboard 重新生成大屏「${title || '工业监控大屏'}」。`,
      '要求：',
      '- 每个维度必须是独立 panel，禁止合并到同一个 multi-grid option',
      '- 提供完整中英文 i18n',
      '- 最终只输出中间件返回的 echarts-i18n URL',
      '面板清单：',
      ...lines,
      '',
      '原始 dashboard JSON 摘要（可参考结构，勿直接手写回聊天）：',
      '```json',
      JSON.stringify(
        {
          type: 'dashboard',
          title: raw?.title,
          layout: raw?.layout || '2x2',
          panelCount: panels.length,
          panelIds: panels.map((p: any) => p.id),
        },
        null,
        2
      ),
      '```',
    ].join('\n');
  }

  return [
    `Please regenerate the dashboard "${title || 'Industrial Dashboard'}" via run_python_in_sandbox + sidea_sdk.export_dashboard.`,
    'Requirements:',
    '- Each dimension must be an independent panel (no multi-grid crowding)',
    '- Provide full zh-CN / en i18n',
    '- Final reply must only include the middleware echarts-i18n URL',
    'Panels:',
    ...lines,
  ].join('\n');
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

function openDashboardInNewTab(payload: {
  title?: string;
  panels: DashboardPanelItem[];
  theme: string;
}) {
  try {
    openDashboardPreviewTab({
      title: payload.title,
      panels: payload.panels,
      theme: payload.theme,
    });
  } catch {
    message.error('新标签页被浏览器拦截，请允许本站打开标签页后重试');
  }
}

function DashboardChart({
  option,
  theme,
  height,
}: {
  option: any;
  theme: string;
  height: string;
}) {
  const { i18n } = useTranslation();
  const { language } = useAppStore();
  const activeLang = language || i18n.language;
  const themed = useMemo(() => applyThemeToOption(option, theme, activeLang), [option, theme, activeLang]);
  const isEmpty = useMemo(() => {
    const series = Array.isArray(themed?.series) ? themed.series : themed?.series ? [themed.series] : [];
    if (!series.length) return true;
    return series.every((s: any) => !Array.isArray(s?.data) || s.data.length === 0);
  }, [themed]);

  if (isEmpty) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-xs"
        style={{ height, color: theme === 'dark' ? '#64748b' : '#94a3b8' }}
      >
        {resolveLangKey(activeLang) === 'zh-CN' ? '暂无数据点' : 'No data points'}
      </div>
    );
  }

  return (
    <ReactECharts
      option={themed}
      style={{ height, width: '100%' }}
      theme={theme}
      notMerge={true}
      lazyUpdate={true}
      opts={{ renderer: 'canvas' }}
    />
  );
}

/** 面板数 → 列数：1 独占；2~4 两列；5~9 三列；10+ 四列。行数向下生长。 */
function panelCols(n: number, fullscreen: boolean): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return fullscreen ? 4 : 3;
}

export function DashboardGrid({
  title,
  panels,
  theme,
  sourceCode,
  raw,
  language: languageOverride,
}: {
  title?: string;
  panels: DashboardPanelItem[];
  theme: string;
  sourceCode?: string;
  raw?: any;
  onAutoFixRequest?: (msg: string) => void;
  language?: string;
}) {
  const { i18n } = useTranslation();
  const { language } = useAppStore();
  const activeLang = languageOverride || language || i18n.language;
  const overlayRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tokens = themeTokens(theme);
  const isZh = resolveLangKey(activeLang) === 'zh-CN';
  const isTrad = /繁|zh-tw|zh-hk|zh-hant/i.test(activeLang || '');
  const L = (zh: string, en: string) => {
    if (!isZh) return en;
    return isTrad ? simplifiedToTraditional(zh) : zh;
  };
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  // 大屏全屏 = 独立覆盖层（脱离聊天流）+ 对覆盖层请求浏览器原生全屏
  const enterFullscreen = useCallback(() => {
    flushSync(() => setIsFullscreen(true));
    const el = overlayRef.current;
    if (el && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        // 原生全屏被拒绝时，覆盖层本身依然铺满视口
      });
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

  // 用户按 Esc 退出浏览器全屏时，同步关闭覆盖层
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

  // 覆盖层打开时禁止背景滚动
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

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
  }, [theme, isZh, isTrad]);

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
  }, [theme, isZh, isTrad]);

  const copyText = useCallback(async (text: string, okMsg: string) => {
    await navigator.clipboard.writeText(text);
    message.success(okMsg);
  }, []);

  const exportMenu: MenuProps['items'] = [
    {
      key: 'prompt',
      icon: <MessageSquareCode size={14} />,
      label: L('导出提示词', 'Export Prompt'),
      onClick: () => {
        const prompt = buildReplayPrompt(raw || { panels }, title, activeLang);
        downloadText(`SIDEA_Dashboard_Prompt_${stamp()}.md`, prompt, 'text/markdown');
        copyText(prompt, L('提示词已复制并下载', 'Prompt copied & downloaded'));
      },
    },
    {
      key: 'data',
      icon: <Table2 size={14} />,
      label: L('导出数据 JSON', 'Export Data JSON'),
      onClick: () => {
        const data = extractSeriesData(panels);
        downloadText(`SIDEA_Dashboard_Data_${stamp()}.json`, JSON.stringify(data, null, 2));
        message.success(L('数据已导出', 'Data exported'));
      },
    },
    {
      key: 'source',
      icon: <FileCode size={14} />,
      label: L('导出源码 JSON', 'Export Source JSON'),
      onClick: () => {
        const src = sourceCode || JSON.stringify(raw || { title, panels }, null, 2);
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

  // 全屏时按面板数量计算列数与行数，让面板铺满整个屏幕
  const fsCols = panelCols(panels.length, true);
  const fsHeroExtra = panels.reduce((acc, p) => {
    if (!p.span || fsCols < 2) return acc;
    return acc + (Math.min(p.span.col, fsCols) * p.span.row - 1);
  }, 0);
  const fsRows = Math.max(1, Math.ceil((panels.length + fsHeroExtra) / fsCols));

  const renderToolbar = (fullscreen: boolean) => (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
      style={{ borderColor: tokens.border, background: theme === 'dark' ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.75)' }}
    >
      <div className="min-w-0">
        <div
          className={`font-bold tracking-wide truncate ${fullscreen ? 'text-lg' : 'text-sm'}`}
          style={{ color: tokens.accent }}
        >
          {title || L('工业监控大屏', 'Industrial Dashboard')}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: tokens.muted }}>
          {L(
            `${panels.length} 个独立面板 · 主题随系统切换 · 支持中英双语`,
            `${panels.length} panels · theme-aware · bilingual`
          )}
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
          onClick={() => openDashboardInNewTab({ title, panels, theme })}
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
          onClick={() =>
            copyText(
              sourceCode || JSON.stringify(raw || { title, panels }, null, 2),
              L('已复制源码', 'Source copied')
            )
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: tokens.border, color: tokens.muted }}
          title={L('复制源码', 'Copy source')}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  );

  const renderGrid = (panelHeight: string, fullscreen: boolean) => {
    const n = panels.length;
    const cols = fullscreen ? fsCols : panelCols(n, false);
    // hero 面板（厂区地图）额外占用的单元格，用于估算总行数
    const heroExtra = panels.reduce((acc, p) => {
      if (!p.span || cols < 2) return acc;
      const c = Math.min(p.span.col, cols);
      const r = p.span.row;
      return acc + (c * r - 1);
    }, 0);
    const rows = fullscreen
      ? fsRows
      : Math.max(1, Math.ceil((n + heroExtra) / cols));
    // 末行剩余空格：让最后一个面板横向撑满，避免出现空黑格
    const leftover = Math.max(0, rows * cols - (n + heroExtra));
    // 聊天内：固定等高单元格 + 显式总高度，任意行数都完整展示（聊天区自身可滚动）
    const chatRowH = 280;
    const isDark = theme === 'dark';
    const gridBg = fullscreen
      ? isDark
        ? 'radial-gradient(1100px 480px at 50% -8%, rgba(34,211,238,0.10), transparent 65%), radial-gradient(900px 420px at 88% 108%, rgba(59,130,246,0.08), transparent 60%), linear-gradient(180deg, #0a0f1e 0%, #0b1220 45%, #090d18 100%)'
        : tokens.shellBg
      : tokens.shellBg;
    return (
      <div
        ref={fullscreen ? undefined : captureRef}
        className={fullscreen ? 'p-3 md:p-4 flex-1 min-h-0' : 'p-3 md:p-4'}
        style={{ background: gridBg }}
      >
        <div
          className={fullscreen ? 'grid gap-3 h-full' : 'grid gap-3'}
          style={
            fullscreen
              ? {
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }
              : {
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, ${chatRowH}px)`,
                  // 显式高度，父级 overflow 也不会把某一行裁成残片
                  minHeight: rows * chatRowH + (rows - 1) * 12,
                }
          }
        >
          {panels.map((panel, idx) => {
            let spanCol = panel.span && cols >= 2 ? Math.min(panel.span.col, cols) : 1;
            const spanRow = panel.span && cols >= 2 ? panel.span.row : 1;
            // 最后一个面板吞掉末行剩余空格
            if (idx === n - 1 && spanCol === 1 && spanRow === 1 && leftover > 0) {
              spanCol = 1 + leftover;
            }
            const cellH = fullscreen ? '100%' : chatRowH * spanRow + (spanRow - 1) * 12;
            // 全屏时按实际跨行数给图表高度，hero 面板不再只占一行的高度
            const chartH = fullscreen
              ? spanRow > 1
                ? `calc(${panelHeight} * ${spanRow} + ${(spanRow - 1) * 12}px)`
                : panelHeight
              : `${cellH}px`;
            return (
              <div
                key={panel.id || idx}
                className="min-w-0 rounded-xl overflow-hidden flex flex-col relative"
                style={{
                  border: `1px solid ${isDark ? 'rgba(34,211,238,0.16)' : tokens.border}`,
                  background: isDark
                    ? 'linear-gradient(180deg, rgba(23,32,52,0.82) 0%, rgba(13,19,33,0.92) 100%)'
                    : tokens.panelBg,
                  height: cellH,
                  gridColumn: spanCol > 1 ? `span ${spanCol}` : undefined,
                  gridRow: spanRow > 1 ? `span ${spanRow}` : undefined,
                  boxShadow: isDark
                    ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 30px rgba(2,8,20,0.45)'
                    : '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                {/* 顶部霓虹光带：呼应工业大屏视觉 */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
                  style={{
                    background: isDark
                      ? 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55) 30%, rgba(59,130,246,0.45) 70%, transparent)'
                      : 'linear-gradient(90deg, transparent, rgba(8,145,178,0.35) 50%, transparent)',
                  }}
                />
                <div className="flex-1 min-h-0 w-full" style={{ height: cellH }}>
                  <DashboardChart
                    option={panel.option}
                    theme={theme}
                    height={chartH}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 全屏覆盖层：脱离聊天窗口，占满整个视口；面板高度按行数均分
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
            {renderGrid(`calc((100vh - 130px) / ${fsRows})`, true)}
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
          // 不用 overflow-hidden：否则第 3 行面板会被父级裁成「一条缝」
          overflow: 'visible',
        }}
      >
        <div className="rounded-2xl overflow-hidden" style={{ borderRadius: 'inherit' }}>
          {renderToolbar(false)}
          {renderGrid('300px', false)}
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
}

export default DashboardGrid;
