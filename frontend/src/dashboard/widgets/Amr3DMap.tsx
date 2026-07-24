import { useMemo, useRef, useEffect, Suspense, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorData, FloorRobot, FloorZone, WidgetRenderProps } from '../types';

import { getApiUrl } from '../../config';

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

function Hero3DModel({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  const groupRef = useRef<THREE.Group>(null);

  // Normalize scale and center
  const normalizedScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return maxDim > 0 ? 18.0 / maxDim : 1.0;
  }, [scene]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <Clone object={scene} scale={normalizedScale} castShadow receiveShadow />
    </group>
  );
}

function GroundZoneOutline({ zone, isDark }: { zone: FloorZone; isDark: boolean }) {
  const w = zone.w * 0.5;
  const d = zone.h * 0.5;
  const cx = (zone.x + zone.w / 2 - 50) * 0.5;
  const cz = (zone.y + zone.h / 2 - 50) * 0.5;

  return (
    <group position={[cx, 0.05, cz]}>
      {/* Subtle floor outline instead of giant blocking box */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial
          color={isDark ? '#0284c7' : '#38bdf8'}
          transparent
          opacity={0.12}
          wireframe={true}
        />
      </mesh>
      <Text
        position={[0, 0.4, 0]}
        fontSize={1.2}
        color={isDark ? '#38bdf8' : '#0284c7'}
        anchorX="center"
        anchorY="bottom"
      >
        {zone.name || zone.id}
      </Text>
    </group>
  );
}

const defaultZones: FloorZone[] = [
  { id: 'z1', name: '洁净区 (Cleanroom)', x: 20, y: 20, w: 25, h: 25 },
  { id: 'z2', name: '加工区 (Processing)', x: 60, y: 20, w: 25, h: 25 },
  { id: 'z3', name: '仓储区 (Storage)', x: 20, y: 60, w: 25, h: 25 },
  { id: 'z4', name: '充能站 (Charging)', x: 60, y: 60, w: 25, h: 25 },
];

export function Amr3DMapWidget({ data, language, height, title, theme }: WidgetRenderProps) {
  const [activeModelUrl, setActiveModelUrl] = useState<string>(
    (data as any)?.model3d_url || '/models/model_wind_turbine.glb'
  );

  useEffect(() => {
    if ((data as any)?.model3d_url) {
      setActiveModelUrl((data as any).model3d_url);
      return;
    }

    fetch(`${getApiUrl()}/models3d/active`)
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

  return (
    <div
      className="relative w-full h-full min-h-[260px] overflow-hidden select-none bg-slate-950/90 rounded-xl"
      style={{ height: heightCss, minHeight: 260 }}
    >
      {title && (
        <div
          className="absolute top-3 left-4 z-10 font-sans text-xs font-bold tracking-wider text-cyan-300 pointer-events-none flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          {title}
        </div>
      )}

      <Canvas shadows camera={{ position: [24, 20, 28], fov: 45 }}>
        <ambientLight intensity={isDark ? 0.9 : 1.2} />
        <directionalLight
          castShadow
          position={[25, 40, 15]}
          intensity={isDark ? 1.8 : 2.2}
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-20, 20, -20]} intensity={0.6} color="#38bdf8" />
        <pointLight position={[20, -10, 20]} intensity={0.4} color="#f59e0b" />

        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI} autoRotate autoRotateSpeed={1.5} />

        <Suspense fallback={null}>
          <gridHelper args={[100, 40, isDark ? '#38bdf8' : '#0284c7', isDark ? '#0f172a' : '#cbd5e1']} position={[0, 0, 0]} />
          
          {/* Render Ground Zone Outlines */}
          {zones.map((z, i) => (
            <GroundZoneOutline key={z.id || i} zone={z} isDark={isDark} />
          ))}

          {/* Render Active Hero 3D Model in Center */}
          <Hero3DModel modelUrl={activeModelUrl} />
        </Suspense>
      </Canvas>

      <div
        className="absolute bottom-2.5 left-4 z-10 pointer-events-none text-[10px] text-cyan-400/80 font-mono"
      >
        {zh
          ? 'True 3D 数字孪生引擎 · 主 3D 建模加载完成 · 支持鼠标 360° 旋转 / 缩放'
          : 'True 3D Digital Twin Engine · Active 3D Model Loaded · 360° Orbit View'}
      </div>
    </div>
  );
}

// Preload 3D Models
useGLTF.preload('/models/model_wind_turbine.glb');
useGLTF.preload('/models/model_cnc_machine.glb');
useGLTF.preload('/models/model_c2bbc369.glb');
useGLTF.preload('/models/model_5e0f8f00.glb');
useGLTF.preload('/models/model_b8cd3981.glb');
useGLTF.preload('/models/model_dcfe2cb0.glb');
