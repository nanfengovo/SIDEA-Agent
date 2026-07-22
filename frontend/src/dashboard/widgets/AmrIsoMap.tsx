import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { FloorData, FloorRobot, FloorZone, WidgetRenderProps } from '../types';

const STATUS_COLOR: Record<string, number> = {
  busy: 0x34d399,
  idle: 0x3b82f6,
  charging: 0xfbbf24,
  fault: 0xef4444,
};

function isZh(language: string) {
  return /zh|中文|简|繁/i.test(language || '');
}

/** World (0–100) → isometric screen */
function toIso(x: number, y: number, scale: number): { x: number; y: number } {
  return {
    x: (x - y) * scale * 0.55,
    y: (x + y) * scale * 0.28,
  };
}

/** Resolve CSS height; never treat "100%" as 100px. */
function cssHeight(height: string | undefined): string {
  const h = (height || '').trim();
  if (!h || h === '100%' || h.endsWith('%')) return '100%';
  if (/^\d+(\.\d+)?px$/i.test(h)) return h;
  if (/^\d+(\.\d+)?$/.test(h)) return `${h}px`;
  return '100%';
}

function drawIsoBox(
  g: Graphics,
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number,
  color: number,
  alpha = 0.9,
) {
  const hw = w / 2;
  const hd = d / 2;
  const top = [
    { x: cx, y: cy - h },
    { x: cx + hw, y: cy - h + hd * 0.5 },
    { x: cx, y: cy - h + hd },
    { x: cx - hw, y: cy - h + hd * 0.5 },
  ];
  const midL = [
    { x: cx - hw, y: cy - h + hd * 0.5 },
    { x: cx, y: cy - h + hd },
    { x: cx, y: cy + hd },
    { x: cx - hw, y: cy + hd * 0.5 },
  ];
  const midR = [
    { x: cx + hw, y: cy - h + hd * 0.5 },
    { x: cx, y: cy - h + hd },
    { x: cx, y: cy + hd },
    { x: cx + hw, y: cy + hd * 0.5 },
  ];

  g.poly(midL.flatMap((p) => [p.x, p.y]));
  g.fill({ color: shade(color, 0.55), alpha });
  g.poly(midR.flatMap((p) => [p.x, p.y]));
  g.fill({ color: shade(color, 0.7), alpha });
  g.poly(top.flatMap((p) => [p.x, p.y]));
  g.fill({ color, alpha });
  g.poly(top.flatMap((p) => [p.x, p.y]));
  g.stroke({ width: 1, color: 0x67e8f9, alpha: 0.35 });
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function drawFloorDiamond(g: Graphics, cx: number, cy: number, size: number, isDark: boolean) {
  const pts = [cx, cy - size * 0.5, cx + size, cy, cx, cy + size * 0.5, cx - size, cy];
  g.poly(pts);
  g.fill({ color: isDark ? 0x0f172a : 0xf1f5f9, alpha: 0.95 });
  g.poly(pts);
  g.stroke({ width: 1.5, color: isDark ? 0x22d3ee : 0x0ea5e9, alpha: 0.45 });
  for (let i = 1; i < 10; i++) {
    const u = i / 10;
    g.moveTo(cx - size * (1 - u), cy - size * 0.5 + size * u * 0.5);
    g.lineTo(cx + size * u, cy - size * 0.5 + size * u * 0.5);
    g.stroke({ width: 0.6, color: isDark ? 0x1e293b : 0xe2e8f0, alpha: 0.9 });
    g.moveTo(cx - size * (1 - u), cy + size * 0.5 - size * u * 0.5);
    g.lineTo(cx + size * u, cy + size * 0.5 - size * u * 0.5);
    g.stroke({ width: 0.6, color: isDark ? 0x1e293b : 0xe2e8f0, alpha: 0.9 });
  }
}

function zoneColor(i: number): number {
  const palette = [0x1d4ed8, 0x0e7490, 0x4c1d95, 0x166534, 0x92400e, 0x9f1239];
  return palette[i % palette.length];
}

/**
 * PixiJS 2.5D isometric AMR floor map.
 * Fills parent cell (DashboardV2 passes height="100%"); must NOT parse "100%" as 100px.
 */
export function AmrIsoMapWidget({ data, language, height, title, theme }: WidgetRenderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const heightCss = cssHeight(height);
  const isDark = theme === 'dark';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let app: Application | null = null;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let currentWorld: Container | null = null;
    let viewState = { offsetX: 0, offsetY: 0, scale: 1 };
    const currentSize = { w: 0, h: 0 };
    const floor = (data || {}) as FloorData;
    const zones: FloorZone[] = Array.isArray(floor.zones) ? floor.zones : [];
    const robots: FloorRobot[] = Array.isArray(floor.robots) ? floor.robots : [];
    const routes = Array.isArray(floor.routes) ? floor.routes : [];

    const measure = () => ({
      w: Math.max(Math.floor(host.clientWidth) || 0, 240),
      h: Math.max(Math.floor(host.clientHeight) || 0, 240),
    });

    const buildScene = (application: Application, w: number, h: number) => {
      application.stage.removeChildren();
      const root = new Container();
      application.stage.addChild(root);

      const scale = Math.min(w, h) / 95;
      const world = new Container();
      world.x = w * 0.5 + viewState.offsetX;
      world.y = h * 0.22 + viewState.offsetY;
      world.scale.set(viewState.scale);
      root.addChild(world);
      currentWorld = world;

      const bg = new Graphics();
      drawFloorDiamond(bg, 0, h * 0.28, Math.min(w, h) * 0.42, isDark);
      world.addChild(bg);

      const zoneLayer = new Container();
      world.addChild(zoneLayer);
      const zoneItems = zones.map((z, i) => {
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        const p = toIso(cx, cy, scale);
        const box = new Graphics();
        const elev = 10 + Math.min(28, (z.w + z.h) * 0.15);
        drawIsoBox(
          box,
          p.x,
          p.y,
          Math.max(18, z.w * scale * 0.35),
          Math.max(14, z.h * scale * 0.28),
          elev,
          zoneColor(i),
          0.88,
        );
        const label = new Text({
          text: z.name || z.id,
          style: {
            fontSize: 10,
            fill: isDark ? 0xa5f3fc : 0x0369a1,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
        });
        label.anchor.set(0.5, 1);
        label.x = p.x;
        label.y = p.y - elev - 4;
        const node = new Container();
        node.addChild(box);
        node.addChild(label);
        node.zIndex = cx + cy;
        return node;
      });
      zoneItems
        .sort((a, b) => a.zIndex - b.zIndex)
        .forEach((n) => zoneLayer.addChild(n));

      const routeG = new Graphics();
      routes.forEach((r) => {
        const coords = r.coords || [];
        if (coords.length < 2) return;
        const pts = coords.map(([x, y]) => toIso(Number(x), Number(y), scale));
        routeG.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) routeG.lineTo(pts[i].x, pts[i].y);
        routeG.stroke({ width: 2, color: isDark ? 0x22d3ee : 0x0ea5e9, alpha: 0.35 });
      });
      world.addChild(routeG);

      const dots: { g: Graphics; path: { x: number; y: number }[]; t: number; speed: number }[] = [];
      routes.forEach((r, ri) => {
        const coords = r.coords || [];
        if (coords.length < 2) return;
        const path = coords.map(([x, y]) => toIso(Number(x), Number(y), scale));
        const g = new Graphics();
        g.circle(0, 0, 3.5);
        g.fill({ color: 0x67e8f9, alpha: 1 });
        world.addChild(g);
        dots.push({ g, path, t: ri * 0.2, speed: 0.004 + (ri % 3) * 0.001 });
      });

      const robotLayer = new Container();
      world.addChild(robotLayer);
      const robotNodes = robots.map((r) => {
        const p = toIso(r.x, r.y, scale);
        const color = STATUS_COLOR[r.status] || STATUS_COLOR.idle;
        const body = new Graphics();
        drawIsoBox(body, 0, 0, 14, 12, 8, color, 1);
        const glow = new Graphics();
        glow.ellipse(0, 6, 10, 5);
        glow.fill({ color, alpha: 0.25 });
        const label = new Text({
          text: r.id,
          style: {
            fontSize: 9,
            fill: isDark ? 0xe2e8f0 : 0x475569,
            fontFamily: 'ui-monospace, monospace',
          },
        });
        label.anchor.set(0.5, 1);
        label.y = -14;
        const node = new Container();
        node.x = p.x;
        node.y = p.y;
        node.addChild(glow);
        node.addChild(body);
        node.addChild(label);
        node.zIndex = r.x + r.y;
        return { node, robot: r, baseY: p.y };
      });
      robotNodes
        .sort((a, b) => a.node.zIndex - b.node.zIndex)
        .forEach((n) => robotLayer.addChild(n.node));

      if (title) {
        const t = new Text({
          text: title,
          style: {
            fontSize: 13,
            fill: isDark ? 0xe2e8f0 : 0x334155,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
        });
        t.x = 14;
        t.y = 10;
        root.addChild(t);
      }

      const zh = isZh(language);
      const legend = new Text({
        text: zh
          ? '2.5D ISO · PixiJS  ·  绿运行 / 蓝待机 / 黄充电 / 红故障'
          : '2.5D ISO · PixiJS  ·  busy/idle/charging/fault',
        style: { fontSize: 10, fill: isDark ? 0x64748b : 0x94a3b8 },
      });
      legend.x = 14;
      legend.y = Math.max(28, h - 22);
      root.addChild(legend);

      return { dots, robotNodes };
    };

    let anim: { dots: any[]; robotNodes: any[] } | null = null;

    (async () => {
      // Wait a frame so parent grid cell has real height (not 0)
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (destroyed) return;

      let { w, h } = measure();
      currentSize.w = w;
      currentSize.h = h;
      // If still collapsed, wait for ResizeObserver
      const application = new Application();
      await application.init({
        width: w,
        height: h,
        background: isDark ? 0x070b16 : 0xffffff,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (destroyed) {
        application.destroy(true);
        return;
      }
      app = application;
      host.innerHTML = '';
      host.appendChild(application.canvas);
      application.canvas.style.width = '100%';
      application.canvas.style.height = '100%';
      application.canvas.style.display = 'block';

      anim = buildScene(application, currentSize.w, currentSize.h);

      let isDragging = false;
      let lastPos = { x: 0, y: 0 };
      
      const onDown = (e: PointerEvent) => {
        isDragging = true;
        lastPos = { x: e.clientX, y: e.clientY };
        application.canvas.setPointerCapture(e.pointerId);
        application.canvas.style.cursor = 'grabbing';
      };
      
      const onUp = (e: PointerEvent) => {
        isDragging = false;
        application.canvas.releasePointerCapture(e.pointerId);
        application.canvas.style.cursor = 'grab';
      };
      
      const onMove = (e: PointerEvent) => {
        if (!isDragging || !currentWorld) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        viewState.offsetX += dx;
        viewState.offsetY += dy;
        currentWorld.x += dx;
        currentWorld.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
      };
      
      const onWheel = (e: WheelEvent) => {
        if (!currentWorld) return;
        e.preventDefault();
        const rect = application.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.2, Math.min(viewState.scale * scaleFactor, 5));
        
        const localX = (mx - currentWorld.x) / viewState.scale;
        const localY = (my - currentWorld.y) / viewState.scale;
        
        viewState.scale = newScale;
        currentWorld.scale.set(viewState.scale);
        
        currentWorld.x = mx - localX * viewState.scale;
        currentWorld.y = my - localY * viewState.scale;
        
        viewState.offsetX = currentWorld.x - currentSize.w * 0.5;
        viewState.offsetY = currentWorld.y - currentSize.h * 0.22;
      };

      application.canvas.style.touchAction = 'none';
      application.canvas.style.cursor = 'grab';
      application.canvas.addEventListener('pointerdown', onDown);
      application.canvas.addEventListener('pointermove', onMove);
      application.canvas.addEventListener('pointerup', onUp);
      application.canvas.addEventListener('pointercancel', onUp);
      application.canvas.addEventListener('wheel', onWheel, { passive: false });

      const tick = () => {
        if (destroyed || !app || !anim) return;
        const now = performance.now();
        anim.dots.forEach((d) => {
          d.t = (d.t + d.speed) % 1;
          const segCount = d.path.length - 1;
          if (segCount < 1) return;
          const f = d.t * segCount;
          const i = Math.min(segCount - 1, Math.floor(f));
          const u = f - i;
          const a = d.path[i];
          const b = d.path[i + 1];
          d.g.x = a.x + (b.x - a.x) * u;
          d.g.y = a.y + (b.y - a.y) * u;
        });
        anim.robotNodes.forEach((rn, i) => {
          if (rn.robot.status === 'busy') {
            rn.node.y = rn.baseY + Math.sin(now / 320 + i) * 1.6;
          } else if (rn.robot.status === 'fault') {
            rn.node.alpha = 0.55 + 0.45 * Math.abs(Math.sin(now / 220));
          }
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      let lastW = w;
      let lastH = h;
      ro = new ResizeObserver(() => {
        if (!app || destroyed) return;
        const next = measure();
        if (Math.abs(next.w - lastW) < 4 && Math.abs(next.h - lastH) < 4) return;
        currentSize.w = next.w;
        currentSize.h = next.h;
        app.renderer.resize(next.w, next.h);
        anim = buildScene(app, next.w, next.h);
      });
      ro.observe(host);
    })().catch((err) => {
      console.error('AmrIsoMap init failed', err);
      if (host && !destroyed) {
        host.innerHTML = `<div style="padding:12px;color:#f87171;font-size:12px">Pixi 2.5D 初始化失败：${String(err?.message || err)}</div>`;
      }
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (app) {
        try {
          app.destroy(true, { children: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [data, language, title, theme]);

  return (
    <div
      ref={hostRef}
      className={`w-full h-full min-h-[240px] overflow-hidden rounded-lg border ${
        isDark ? 'border-cyan-500/25 bg-[#070b16]' : 'border-slate-200 bg-white'
      }`}
      style={{ height: heightCss, minHeight: 240 }}
    />
  );
}
