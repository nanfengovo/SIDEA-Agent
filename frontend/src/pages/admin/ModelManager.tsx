import React, { useEffect, useState, Suspense, useRef } from 'react';
import { Box, Download, Trash2, RefreshCcw, Upload, CheckCircle, X, FileBox, Cpu, Maximize2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';
import { App, Modal } from 'antd';
import Generic3DViewport from '../../components/Generic3DViewport';

interface Model3D {
  id: string;
  name: string;
  keyword: string;
  file_path: string;
  status: string;
  created_at: string;
}

type UploadPhase = 'idle' | 'reading' | 'uploading' | 'parsing' | 'done' | 'error';

class ModelErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: any) {
    console.warn('3D Model load error:', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center text-xs text-amber-400 p-2 text-center bg-black/40">
          <Box size={24} className="mb-1 opacity-70" />
          <span>模型结构解析中断 / 资源不可达</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function ModelPreview({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// ─── Upload Progress Modal ───────────────────────────────────────────────────
interface UploadModalProps {
  phase: UploadPhase;
  fileName: string;
  progress: number;
  onClose: () => void;
}

const PHASE_LABELS: Record<UploadPhase, string> = {
  idle: '',
  reading: '读取本地文件...',
  uploading: '上传至本地服务器...',
  parsing: 'OpenCASCADE 正在解析 CAD 几何体网格...',
  done: '模型 3D 转换与导入成功！',
  error: '上传或解析失败，请重试。',
};

function UploadModal({ phase, fileName, progress, onClose }: UploadModalProps) {
  if (phase === 'idle') return null;

  const isDone = phase === 'done';
  const isError = phase === 'error';
  const isActive = !isDone && !isError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isDone || isError ? onClose : undefined} />

      {/* Modal card */}
      <div className="relative z-10 w-[460px] bg-[#0d1117] border border-[var(--border-color)] rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6 animate-fade-in">
        {/* Close button (only after done/error) */}
        {(isDone || isError) && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}

        {/* Icon / Spinner */}
        <div className="relative flex items-center justify-center w-20 h-20">
          {isActive && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-cyan)]/20" />
              <div className="absolute inset-0 rounded-full border-t-2 border-[var(--accent-cyan)] animate-spin" />
            </>
          )}
          {isDone && (
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle size={40} className="text-emerald-400" />
            </div>
          )}
          {isError && (
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <X size={40} className="text-red-400" />
            </div>
          )}
          {isActive && (
            <div className="absolute">
              {phase === 'reading' && <FileBox size={28} className="text-[var(--accent-cyan)]" />}
              {phase === 'uploading' && <Upload size={28} className="text-[var(--accent-cyan)]" />}
              {phase === 'parsing' && <Cpu size={28} className="text-[var(--accent-purple)] animate-pulse" />}
            </div>
          )}
        </div>

        {/* File name */}
        <div className="text-center">
          <p className="text-xs text-[var(--text-secondary)] mb-1 truncate max-w-[360px]" title={fileName}>
            {fileName}
          </p>
          <p
            className={`text-base font-semibold ${
              isDone ? 'text-emerald-400' : isError ? 'text-red-400' : 'text-[var(--text-primary)]'
            }`}
          >
            {PHASE_LABELS[phase]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>{isActive ? '处理中' : isDone ? '完成' : '失败'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDone
                  ? 'bg-emerald-500'
                  : isError
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Phase steps */}
        <div className="w-full flex justify-between text-[11px]">
          {(['reading', 'uploading', 'parsing', 'done'] as UploadPhase[]).map((p) => {
            const phaseOrder: UploadPhase[] = ['reading', 'uploading', 'parsing', 'done'];
            const currentIdx = phaseOrder.indexOf(phase === 'error' ? 'reading' : phase);
            const stepIdx = phaseOrder.indexOf(p);
            const isPast = stepIdx < currentIdx || isDone;
            const isCurrent = p === phase && !isDone;
            return (
              <div key={p} className={`flex flex-col items-center gap-1 ${isPast || isDone ? 'text-emerald-400' : isCurrent ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)]/40'}`}>
                <div className={`w-2 h-2 rounded-full ${isPast || isDone ? 'bg-emerald-400' : isCurrent ? 'bg-[var(--accent-cyan)]' : 'bg-white/10'}`} />
                <span>{PHASE_LABELS[p]}</span>
              </div>
            );
          })}
        </div>

        {/* Done button */}
        {(isDone || isError) && (
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
              isDone
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            }`}
          >
            {isDone ? '✅ 查看已导入模型' : '❌ 关闭'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ModelManager() {
  const { modal, message } = App.useApp();
  const [models, setModels] = useState<Model3D[]>([]);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeModel, setActiveModel] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload modal state
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [fullscreenModel, setFullscreenModel] = useState<Model3D | null>(null);

  const fetchActiveModel = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/models3d/active');
      const data = await res.json();
      setActiveModel(data.active_model);
    } catch (e) {}
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/models3d/');
      const data = await res.json();
      setModels(data.models || []);
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchActiveModel();
  }, []);

  // ── Scrape ────────────────────────────────────────────────────────────────
  const handleScrape = async () => {
    setScrapeLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/models3d/scrape?keyword=${encodeURIComponent(keyword)}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.status === 'success') {
        message.success(`成功抓取了 ${data.downloaded} 个模型！`);
        fetchModels();
      }
    } catch (e) {
      message.error('抓取失败，请查看后台日志。');
    }
    setScrapeLoading(false);
  };

  // ── Upload (with progress modal + STEP async job polling) ────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadFileName(file.name);
    setUploadProgress(0);
    setUploadPhase('reading');

    await new Promise((r) => setTimeout(r, 300));
    setUploadProgress(15);
    setUploadPhase('uploading');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Upload with XHR progress
      const responseText = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'http://localhost:8000/api/models3d/upload');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 50) + 15;
            setUploadProgress(pct);
            if (pct >= 64) {
              setUploadPhase('parsing');
            }
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
          else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      const data = JSON.parse(responseText);

      // ── STEP async job: poll /api/models3d/job/{job_id} ──────────────────
      if (data.status === 'converting' && data.job_id) {
        setUploadPhase('parsing');
        setUploadProgress(72);

        const pollJob = async () => {
          while (true) {
            await new Promise((r) => setTimeout(r, 1500));
            const jr = await fetch(`http://localhost:8000/api/models3d/job/${data.job_id}`);
            const job = await jr.json();
            setUploadProgress(Math.min(job.progress ?? 70, 99));
            if (job.status === 'done') {
              setUploadProgress(100);
              setUploadPhase('done');
              fetchModels();
              return;
            }
            if (job.status === 'error') {
              setUploadProgress(100);
              setUploadPhase('error');
              return;
            }
          }
        };
        pollJob();
        return; // Don't reach cleanup yet; pollJob owns the phase
      }

      // ── GLB/GLTF: done immediately ────────────────────────────────────────
      setUploadProgress(100);
      setUploadPhase('done');
      fetchModels();
    } catch (err) {
      console.error(err);
      setUploadProgress(100);
      setUploadPhase('error');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: '确定删除此模型？',
      content: '物理文件也会一并删除，操作不可恢复！',
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await fetch(`http://localhost:8000/api/models3d/${id}`, { method: 'DELETE' });
          message.success('删除成功');
          fetchModels();
        } catch (e) {
          console.error(e);
          message.error('删除失败');
        }
      },
    });
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/models3d/use/${id}`, { method: 'POST' });
      if (res.ok) {
        fetchActiveModel();
        message.success('已成功设置为大屏主模型！');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {/* Upload Progress Modal */}
      <UploadModal
        phase={uploadPhase}
        fileName={uploadFileName}
        progress={uploadProgress}
        onClose={() => setUploadPhase('idle')}
      />

      <div className="h-full flex flex-col bg-[var(--bg-dark)] p-6 text-[var(--text-primary)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Box className="text-[var(--accent-purple)]" /> 3D 资产库 (Asset Manager)
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              自动从外部开源代码库 (如 Three.js) 爬取符合关键字的 .glb 模型并保存至本地。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="如 'agv' 或 'robot'"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg outline-none focus:border-[var(--accent-cyan)]"
            />
            <button
              onClick={handleScrape}
              disabled={scrapeLoading}
              className="flex items-center gap-2 bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] px-4 py-2 rounded-lg hover:bg-[var(--accent-purple)]/30 transition-colors disabled:opacity-50"
            >
              {scrapeLoading ? <RefreshCcw size={16} className="animate-spin" /> : <Download size={16} />}
              {scrapeLoading ? '全网搜刮中...' : '一键抓取模型'}
            </button>

            {/* ← Hidden file input + Upload button (separate from scrape loading) */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".glb,.gltf,.stp,.step"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhase !== 'idle' && uploadPhase !== 'done' && uploadPhase !== 'error'}
              className="flex items-center gap-2 bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] px-4 py-2 rounded-lg hover:bg-[var(--accent-cyan)]/30 transition-colors disabled:opacity-50"
            >
              <Upload size={16} /> 本地导入
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {models.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] opacity-50">
              <Box size={64} className="mb-4" />
              <p>暂无本地 3D 模型资产，请输入关键字点击抓取。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-lg group"
                >
                  {/* 3D Preview */}
                  <div className="h-48 w-full bg-black/20 relative cursor-grab active:cursor-grabbing">
                    <Canvas shadows camera={{ position: [0, 0, 5], fov: 50 }}>
                      <ambientLight intensity={0.9} />
                      <directionalLight position={[10, 10, 5]} intensity={1.5} />
                      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
                      <Suspense fallback={null}>
                        <Stage environment={null} intensity={0.6}>
                          <ModelErrorBoundary>
                            <ModelPreview url={model.file_path} />
                          </ModelErrorBoundary>
                        </Stage>
                      </Suspense>
                      <OrbitControls autoRotate autoRotateSpeed={2} />
                    </Canvas>
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                      <button
                        onClick={() => setFullscreenModel(model)}
                        className="bg-black/60 hover:bg-cyan-900/80 text-cyan-300 p-1.5 rounded text-xs backdrop-blur border border-cyan-500/30 transition-colors flex items-center gap-1"
                        title="全屏 3D 交互预览"
                      >
                        <Maximize2 size={13} />
                        <span>全屏预览</span>
                      </button>
                      <div className="bg-black/60 px-2 py-1 rounded text-xs text-white backdrop-blur flex items-center gap-1">
                        <Box size={12} /> {model.status}
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="p-4">
                    <h3 className="font-semibold text-lg truncate" title={model.name}>
                      {model.name}
                    </h3>

                    <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-secondary)] border-t border-[var(--border-color)] pt-3">
                      <span className="truncate w-1/3" title={model.file_path}>
                        {model.file_path.split('/').pop()}
                      </span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setFullscreenModel(model)}
                          className="text-cyan-400 hover:text-cyan-300 p-1 bg-cyan-400/10 rounded transition-colors"
                          title="全屏 3D 交互预览"
                        >
                          <Maximize2 size={16} />
                        </button>

                        <a
                          href={`http://localhost:8000/api/models3d/download/${model.id}`}
                          download
                          className="text-[var(--accent-cyan)] hover:text-cyan-300 p-1 bg-cyan-400/10 rounded transition-colors"
                          title="下载原始模型 (STP/GLB)"
                        >
                          <Download size={16} />
                        </a>

                        <button
                          onClick={() => handleSetActive(model.id)}
                          className={`p-1 rounded transition-colors flex items-center gap-1 ${
                            activeModel === model.file_path
                              ? 'bg-green-500/20 text-green-400 cursor-default'
                              : 'bg-blue-400/10 text-blue-400 hover:text-blue-300'
                          }`}
                          title="设为大屏使用模型"
                          disabled={activeModel === model.file_path}
                        >
                          <CheckCircle size={16} />
                          {activeModel === model.file_path && <span>使用中</span>}
                        </button>

                        <button
                          onClick={() => handleDelete(model.id)}
                          className="text-red-400 hover:text-red-300 p-1 bg-red-400/10 rounded transition-colors"
                          title="物理删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen 3D Preview Modal */}
      <Modal
        open={!!fullscreenModel}
        onCancel={() => setFullscreenModel(null)}
        footer={null}
        width="100vw"
        style={{ top: 0, padding: 0, margin: 0, maxWidth: '100vw' }}
        styles={{
          content: { padding: 0, background: '#020617', borderRadius: 0, height: '100vh', width: '100vw', overflow: 'hidden' },
          body: { background: '#020617', padding: 0, height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }}
      >
        {fullscreenModel && (
          <Generic3DViewport
            modelUrl={fullscreenModel.file_path}
            title={`${fullscreenModel.name} · 沉浸式 3D 数字孪生渲染器 (支持鼠标 360° 旋转/缩放/平移与视角切换)`}
            autoRotate={true}
            height="100%"
          />
        )}
      </Modal>
    </>
  );
}
