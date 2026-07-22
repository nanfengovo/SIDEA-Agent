import { useMemo, useRef, useEffect, Suspense, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorData, FloorRobot, FloorZone, WidgetRenderProps } from '../types';

const STATUS_COLOR: Record<string, string> = {
  busy: '#34d399',
  idle: '#3b82f6',
  charging: '#fbbf24',
  fault: '#ef4444',
};

function isZh(language: string) {
  return /zh|中文|简|繁/i.test(language || '');
}

function cssHeight(height: string | undefined): string {
  const h = (height || '').trim();
  if (!h || h === '100%' || h.endsWith('%')) return '100%';
  if (/^\d+(\.\d+)?px$/i.test(h)) return h;
  if (/^\d+(\.\d+)?$/.test(h)) return `${h}px`;
  return '100%';
}

const MODEL_LIBRARY = [
  '/models/model_c2bbc369.glb', // Industrial AGV
  '/models/model_5e0f8f00.glb', // Robotic Arm
  '/models/model_b8cd3981.glb', // Cybernetic Rover
  '/models/model_dcfe2cb0.glb', // Factory Gearbox/Equipment
];

function getModelForRobot(index: number, robot: any, activeModelUrl: string): string {
  if (robot?.model_url) return robot.model_url;
  if (robot?.modelUrl) return robot.modelUrl;
  if (activeModelUrl && activeModelUrl !== '/models/robot.glb') {
    return activeModelUrl;
  }
  return MODEL_LIBRARY[index % MODEL_LIBRARY.length];
}

function Floor({ isDark }: { isDark: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshStandardMaterial
        color={isDark ? '#090d16' : '#f1f5f9'}
        roughness={0.6}
        metalness={0.4}
      />
    </mesh>
  );
}

function ZoneCrate({ zone, isDark }: { zone: FloorZone; isDark: boolean }) {
  const w = zone.w;
  const d = zone.h;
  const h = 4 + Math.min(6, (w + d) * 0.1);
  const cx = zone.x + w / 2;
  const cz = zone.y + d / 2;
  const scale = 0.5;

  return (
    <group position={[(cx - 50) * scale, h * scale * 0.5, (cz - 50) * scale]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w * scale, h * scale, d * scale]} />
        <meshStandardMaterial
          color={isDark ? '#1e293b' : '#cbd5e1'}
          roughness={0.5}
          metalness={0.5}
          wireframe={false}
        />
      </mesh>
      <Text
        position={[0, (h * scale * 0.5) + 0.5, 0]}
        fontSize={1.5}
        color={isDark ? '#a5f3fc' : '#0369a1'}
        anchorX="center"
        anchorY="bottom"
      >
        {zone.name || zone.id}
      </Text>
    </group>
  );
}

function Robot({ robot, isDark, index, modelUrl }: { robot: FloorRobot; isDark: boolean; index: number; modelUrl: string }) {
  const scale = 0.5;
  const color = STATUS_COLOR[robot.status] || STATUS_COLOR.idle;
  const targetModelUrl = getModelForRobot(index, robot, modelUrl);

  const { scene } = useGLTF(targetModelUrl);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (robot.status === 'busy' && groupRef.current) {
      groupRef.current.position.z = (robot.y - 50) * scale + Math.sin(t * 2 + index) * 0.5;
    }
  });

  const modelScale = targetModelUrl.includes('model_5e0f8f00') ? 0.7 : 0.35;

  return (
    <group ref={groupRef} position={[(robot.x - 50) * scale, 0, (robot.y - 50) * scale]}>
      {/* 3D Model from Model Library */}
      <Clone object={scene} scale={modelScale} position={[0, 0, 0]} castShadow receiveShadow />
      
      {/* Status indicator Light floating above */}
      <mesh position={[0, 4.5 * scale, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <Text
        position={[0, 5.5 * scale, 0]}
        fontSize={1.4}
        color={isDark ? '#e2e8f0' : '#0f172a'}
        anchorX="center"
        anchorY="bottom"
      >
        {robot.name || robot.id}
      </Text>
    </group>
  );
}

function Routes({ routes, isDark }: { routes: any[]; isDark: boolean }) {
  if (!routes || !routes.length) return null;
  return null;
}

const defaultZones: FloorZone[] = [
  { id: 'z1', name: '洁净/光刻区 (Cleanroom)', x: 15, y: 15, w: 25, h: 25 },
  { id: 'z2', name: '刻蚀/薄膜区 (Etch Zone)', x: 65, y: 15, w: 25, h: 25 },
  { id: 'z3', name: 'FOUP 晶圆仓 (Wafer Buffer)', x: 15, y: 65, w: 25, h: 25 },
  { id: 'z4', name: 'AGV 充电站 (Charging)', x: 65, y: 65, w: 25, h: 25 },
];

const defaultRobots: FloorRobot[] = [
  { id: 'AMR-01', name: '晶圆搬运 AMR-01', x: 25, y: 30, status: 'busy' },
  { id: 'COBOT-01', name: '6轴协作机械臂 Arm-01', x: 75, y: 30, status: 'busy' },
  { id: 'ROVER-02', name: '巡检漫游车 Rover-02', x: 28, y: 75, status: 'idle' },
  { id: 'EQUIP-03', name: '半导体加工设备 Machine-03', x: 75, y: 75, status: 'charging' },
];

export function Amr3DMapWidget({ data, language, height, title, theme }: WidgetRenderProps) {
  const [activeModelUrl, setActiveModelUrl] = useState<string>(
    (data as any)?.model3d_url || '/models/model_c2bbc369.glb'
  );

  useEffect(() => {
    if ((data as any)?.model3d_url) {
      setActiveModelUrl((data as any).model3d_url);
      return;
    }

    fetch('http://localhost:8000/api/models3d/active')
      .then(res => res.json())
      .then(resData => {
        if (resData.active_model) {
          setActiveModelUrl(resData.active_model);
        }
      })
      .catch(e => console.error('Failed to fetch active model:', e));
  }, [(data as any)?.model3d_url]);

  const heightCss = cssHeight(height);
  const isDark = theme === 'dark';
  const zh = isZh(language);

  const floor = (data || {}) as FloorData;
  const zones: FloorZone[] = Array.isArray(floor.zones) && floor.zones.length > 0 ? floor.zones : defaultZones;
  const robots: FloorRobot[] = Array.isArray(floor.robots) && floor.robots.length > 0 ? floor.robots : defaultRobots;
  const routes = Array.isArray(floor.routes) ? floor.routes : [];

  return (
    <div
      className="relative w-full h-full min-h-[240px] overflow-hidden"
      style={{ height: heightCss, minHeight: 240 }}
    >
      {title && (
        <div
          className="absolute top-2.5 left-3.5 z-10 font-sans text-[13px] pointer-events-none"
          style={{ color: isDark ? '#e2e8f0' : '#334155' }}
        >
          {title}
        </div>
      )}

      <Canvas shadows camera={{ position: [-25, 30, 25], fov: 45 }}>
        <ambientLight intensity={isDark ? 0.6 : 1.0} />
        <directionalLight
          castShadow
          position={[20, 40, -10]}
          intensity={isDark ? 1.5 : 1.8}
          shadow-mapSize={[1024, 1024]}
        >
          <orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50]} />
        </directionalLight>
        
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} />

        <Suspense fallback={null}>
          <gridHelper args={[120, 40, isDark ? '#22d3ee' : '#0ea5e9', isDark ? '#164e63' : '#bae6fd']} position={[0, -0.05, 0]} />
          <Floor isDark={isDark} />
          {zones.map((z, i) => (
            <ZoneCrate key={z.id || i} zone={z} isDark={isDark} />
          ))}
          <Routes routes={routes} isDark={isDark} />
          {robots.map((r, i) => (
            <Robot key={r.id || i} robot={r} isDark={isDark} index={i} modelUrl={activeModelUrl} />
          ))}
        </Suspense>
      </Canvas>

      <div
        className="absolute bottom-3 left-3.5 z-10 pointer-events-none text-[10px]"
        style={{ color: isDark ? '#94a3b8' : '#64748b' }}
      >
        {zh
          ? 'True 3D 数字孪生引擎 · 3D 模型库已联动 · 绿运行 / 蓝待机 / 黄充电 / 红故障'
          : 'True 3D Digital Twin Engine · 3D Model Library Connected · busy / idle / charging / fault'}
      </div>
    </div>
  );
}

// Preload 3D Models from Model Library
useGLTF.preload('/models/model_c2bbc369.glb');
useGLTF.preload('/models/model_5e0f8f00.glb');
useGLTF.preload('/models/model_b8cd3981.glb');
useGLTF.preload('/models/model_dcfe2cb0.glb');
