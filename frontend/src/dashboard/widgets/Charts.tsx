import { useMemo } from 'react';
import { DashboardChart } from '../../components/DashboardPanel';
import type { WidgetRenderProps, FloorData, GaugePairData, StatusSlice, TrendComboData, CustomEchartsData } from '../types';

function isZh(language: string) {
  return /zh|中文|简|繁/i.test(language || '');
}

const STATUS_COLOR: Record<string, string> = {
  busy: '#34d399',
  idle: '#3b82f6',
  charging: '#fbbf24',
  fault: '#ef4444',
};

/** Build ECharts option from structured floor data (or pass through legacy option). */
export function buildFloorOption(data: FloorData, language: string): any {
  if (data?.option && typeof data.option === 'object') return data.option;

  const zh = isZh(language);
  const zones = data?.zones || [];
  const robots = data?.robots || [];
  const routes = data?.routes || [];

  const markArea = {
    silent: true,
    data: zones.map((z) => [
      {
        name: z.name,
        xAxis: z.x,
        yAxis: z.y,
        itemStyle: {
          color: 'rgba(34,211,238,0.08)',
          borderColor: 'rgba(34,211,238,0.45)',
          borderWidth: 1,
        },
        label: { show: true, position: 'insideTopLeft', color: '#67e8f9', fontSize: 11 },
      },
      { xAxis: z.x + z.w, yAxis: z.y + z.h },
    ]),
  };

  const byStatus: Record<string, any[]> = { busy: [], idle: [], charging: [], fault: [] };
  robots.forEach((r) => {
    const key = byStatus[r.status] ? r.status : 'idle';
    byStatus[key].push({ value: [r.x, r.y], name: r.id });
  });

  const axisHidden = {
    type: 'value',
    min: 0,
    max: 100,
    show: false,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false },
  };

  const series: any[] = [
    { name: zh ? '分区' : 'Zones', type: 'scatter', data: [], silent: true, markArea },
    {
      name: zh ? '路径' : 'Routes',
      type: 'lines',
      coordinateSystem: 'cartesian2d',
      polyline: true,
      silent: true,
      data: routes.map((r) => ({ coords: r.coords })),
      lineStyle: { color: '#22d3ee', width: 1.5, opacity: 0.35, curveness: 0.12 },
      effect: {
        show: true,
        period: 4,
        trailLength: 0.55,
        symbol: 'arrow',
        symbolSize: 7,
        color: '#67e8f9',
      },
      z: 2,
    },
  ];

  (['busy', 'idle', 'charging', 'fault'] as const).forEach((st) => {
    if (!byStatus[st].length) return;
    const labels: Record<string, string> = {
      busy: zh ? '运行' : 'Busy',
      idle: zh ? '待机' : 'Idle',
      charging: zh ? '充电' : 'Charging',
      fault: zh ? '故障' : 'Fault',
    };
    series.push({
      name: labels[st],
      type: 'effectScatter',
      symbolSize: 13,
      data: byStatus[st],
      rippleEffect: { brushType: 'stroke', scale: 3.2 },
      itemStyle: { color: STATUS_COLOR[st], shadowBlur: 8, shadowColor: STATUS_COLOR[st] },
      label: {
        show: true,
        position: 'top',
        color: '#e2e8f0',
        fontSize: 9,
        formatter: '{b}',
      },
      z: 5,
    });
  });

  return {
    backgroundColor: 'transparent',
    grid: { left: 12, right: 12, top: 36, bottom: 12, show: true, borderColor: '#22d3ee', borderWidth: 1 },
    tooltip: { trigger: 'item' },
    legend: { top: 8, right: 12, textStyle: { color: '#94a3b8', fontSize: 11 } },
    xAxis: axisHidden,
    yAxis: axisHidden,
    series,
  };
}

export function AmrFloorMapWidget({ data, theme, language, height, title }: WidgetRenderProps) {
  const option = useMemo(() => buildFloorOption((data || {}) as FloorData, language), [data, language]);
  const withTitle = useMemo(() => {
    if (!title) return option;
    return {
      ...option,
      title: {
        text: title,
        left: 'center',
        textStyle: { color: theme === 'dark' ? '#e2e8f0' : '#0f172a', fontSize: 13 },
      },
    };
  }, [option, title, theme]);
  return <DashboardChart option={withTitle} theme={theme} height={height} />;
}

export function CustomEchartsWidget({ data, theme, height, title }: WidgetRenderProps) {
  const raw = (data || {}) as CustomEchartsData;
  const option = useMemo(() => {
    const opt = (raw?.option || data) as any;
    if (!opt || typeof opt !== 'object') return { series: [] };
    if (!title || opt.title) return opt;
    return {
      ...opt,
      title: {
        text: title,
        left: 'center',
        textStyle: { color: '#e2e8f0', fontSize: 13 },
      },
    };
  }, [raw, data, title]);
  return <DashboardChart option={option} theme={theme} height={height} />;
}

export function GaugePairWidget({ data, theme, language, height, title }: WidgetRenderProps) {
  const d = (data || {}) as GaugePairData;
  const zh = isZh(language);
  const option = useMemo(() => {
    const left = d.left || { label: 'A', value: 0 };
    const right = d.right || { label: 'B', value: 0 };
    const mk = (item: { label: string; label_en?: string; value: number }, center: string[]) => ({
      type: 'gauge',
      center,
      radius: '68%',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      progress: { show: true, roundCap: true, width: 12 },
      axisLine: {
        lineStyle: {
          width: 12,
          color: [
            [0.6, '#ef4444'],
            [0.85, '#fbbf24'],
            [1, '#34d399'],
          ],
        },
      },
      pointer: { length: '55%', width: 4 },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { color: '#64748b' } },
      axisLabel: { color: '#94a3b8', distance: 12, fontSize: 10 },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        color: '#e2e8f0',
        fontSize: 16,
        offsetCenter: [0, '70%'],
      },
      title: { offsetCenter: [0, '98%'], color: '#94a3b8', fontSize: 11 },
      data: [
        {
          value: Math.round((Number(item.value) || 0) * (Number(item.value) <= 1 ? 100 : 1)),
          name: zh ? item.label : item.label_en || item.label,
        },
      ],
      animationDuration: 1200,
    });
    return {
      backgroundColor: 'transparent',
      title: title
        ? { text: title, left: 'center', textStyle: { color: '#e2e8f0', fontSize: 13 } }
        : undefined,
      series: [mk(left, ['25%', '52%']), mk(right, ['75%', '52%'])],
    };
  }, [d, zh, title]);
  return <DashboardChart option={option} theme={theme} height={height} />;
}

export function StatusDonutWidget({ data, theme, language, height, title }: WidgetRenderProps) {
  const slices = (Array.isArray(data) ? data : []) as StatusSlice[];
  const zh = isZh(language);
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      title: title
        ? { text: title, left: 'center', textStyle: { color: '#e2e8f0', fontSize: 13 } }
        : undefined,
      tooltip: { trigger: 'item' },
      legend: { bottom: 4, textStyle: { color: '#94a3b8', fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '68%'],
          center: ['50%', '46%'],
          itemStyle: { borderRadius: 6, borderColor: '#0b1220', borderWidth: 2 },
          label: { color: '#cbd5e1', fontSize: 11 },
          data: slices.map((s) => ({
            name: zh ? s.name : s.name_en || s.name,
            value: s.value,
            itemStyle: s.color ? { color: s.color } : undefined,
          })),
        },
      ],
    }),
    [slices, zh, title]
  );
  return <DashboardChart option={option} theme={theme} height={height} />;
}

export function TrendComboWidget({ data, theme, language, height, title }: WidgetRenderProps) {
  const d = (data || {}) as TrendComboData;
  const zh = isZh(language);
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      title: title
        ? { text: title, left: 'center', textStyle: { color: '#e2e8f0', fontSize: 13 } }
        : undefined,
      tooltip: { trigger: 'axis' },
      legend: { top: 28, textStyle: { color: '#94a3b8', fontSize: 11 } },
      grid: { left: 44, right: 44, top: 56, bottom: 28 },
      xAxis: { type: 'category', data: d.x || [], axisLabel: { color: '#94a3b8' } },
      yAxis: [
        { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.14)' } } },
        { type: 'value', axisLabel: { color: '#94a3b8', formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: (d.series || []).map((s) => ({
        name: zh ? s.name : s.name_en || s.name,
        type: s.type,
        yAxisIndex: s.yAxisIndex || 0,
        data: s.data,
        smooth: s.type === 'line',
        areaStyle: s.type === 'line' ? { opacity: 0.12 } : undefined,
      })),
    }),
    [d, zh, title]
  );
  return <DashboardChart option={option} theme={theme} height={height} />;
}

export function Bar3dLoadWidget({ data, theme, height, title }: WidgetRenderProps) {
  // Accept either structured grid or legacy option
  const option = useMemo(() => {
    const raw = data as any;
    if (raw?.option) return raw.option;
    if (raw?.grid3D || raw?.series) return raw;
    const xs = raw?.x_size || 8;
    const ys = raw?.y_size || 8;
    const cells = raw?.data || [];
    return {
      backgroundColor: 'transparent',
      title: title
        ? { text: title, left: 'center', textStyle: { color: '#e2e8f0', fontSize: 13 } }
        : undefined,
      tooltip: {},
      visualMap: {
        max: 100,
        inRange: { color: ['#1e3a5f', '#22d3ee', '#34d399', '#fbbf24', '#ef4444'] },
      },
      xAxis3D: { type: 'category', data: Array.from({ length: xs }, (_, i) => `X${i}`) },
      yAxis3D: { type: 'category', data: Array.from({ length: ys }, (_, i) => `Y${i}`) },
      zAxis3D: { type: 'value' },
      grid3D: {
        boxWidth: 170,
        boxDepth: 110,
        viewControl: { autoRotate: true, autoRotateSpeed: 6, distance: 180 },
        light: { main: { intensity: 1.2, shadow: true } },
      },
      series: [{ type: 'bar3D', shading: 'lambert', data: cells }],
    };
  }, [data, title]);
  return <DashboardChart option={option} theme={theme} height={height} />;
}
