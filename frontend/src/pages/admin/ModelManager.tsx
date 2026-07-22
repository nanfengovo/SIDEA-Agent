import React, { useEffect, useState, Suspense } from 'react';
import { Box, Download, Trash2, Tag, RefreshCcw, Upload, CheckCircle } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';
import { App } from 'antd';

interface Model3D {
  id: string;
  name: string;
  keyword: string;
  file_path: string;
  status: string;
  created_at: string;
}

function ModelPreview({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export default function ModelManager() {
  const { modal, message } = App.useApp();
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeModel, setActiveModel] = useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const handleScrape = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/models3d/scrape?keyword=${encodeURIComponent(keyword)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(`成功抓取了 ${data.downloaded} 个模型！`);
        fetchModels();
      }
    } catch (e) {
      message.error('抓取失败，请查看后台日志。');
    }
    setLoading(false);
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
      }
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/models3d/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        message.success('上传成功');
        fetchModels();
      } else {
        message.error('上传失败');
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/models3d/use/${id}`, { method: 'POST' });
      if (res.ok) {
        fetchActiveModel();
        alert('已成功设置为大屏主模型！');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
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
            disabled={loading}
            className="flex items-center gap-2 bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] px-4 py-2 rounded-lg hover:bg-[var(--accent-purple)]/30 transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCcw size={16} className="animate-spin" /> : <Download size={16} />}
            {loading ? '全网搜刮中...' : '一键抓取模型'}
          </button>
          
          <input type="file" ref={fileInputRef} className="hidden" accept=".glb,.gltf,.stp,.step" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
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
            {models.map(model => (
              <div key={model.id} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-lg group">
                {/* 3D Preview */}
                <div className="h-48 w-full bg-black/20 relative cursor-grab active:cursor-grabbing">
                  <Canvas shadows camera={{ position: [0, 0, 5], fov: 50 }}>
                    <Suspense fallback={null}>
                      <Stage environment="city" intensity={0.5}>
                        <ModelPreview url={model.file_path} />
                      </Stage>
                    </Suspense>
                    <OrbitControls autoRotate autoRotateSpeed={2} />
                  </Canvas>
                  <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white backdrop-blur flex items-center gap-1">
                    <Box size={12} /> {model.status}
                  </div>
                </div>
                
                {/* Meta */}
                <div className="p-4">
                  <h3 className="font-semibold text-lg truncate" title={model.name}>{model.name}</h3>
                  
                  <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-secondary)] border-t border-[var(--border-color)] pt-3">
                    <span className="truncate w-1/3" title={model.file_path}>{model.file_path.split('/').pop()}</span>
                    
                    <div className="flex gap-2">
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
  );
}
