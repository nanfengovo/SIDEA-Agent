import React, { useState } from 'react';
import { Settings, Cpu, Wrench, ArrowLeft } from 'lucide-react';
import ConfigManager from './ConfigManager';
import SkillsManager from './SkillsManager';
import ToolsViewer from './ToolsViewer';

interface AdminLayoutProps {
  onExit: () => void;
}

export default function AdminLayout({ onExit }: AdminLayoutProps) {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="flex h-screen w-full bg-[var(--bg-dark)] text-[var(--text-primary)] transition-colors duration-300">
      {/* Sidebar */}
      <div className="w-64 border-r border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col shrink-0 transition-colors duration-300">
        <div className="h-16 flex items-center px-6 border-b border-[var(--border-color)] justify-between">
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] m-0 glow-text">
            Admin Console
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            <li>
              <button 
                onClick={() => setActiveTab('config')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'config' ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' : 'hover:bg-white/5'}`}
              >
                <Settings size={18} />
                <span>全局设置</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('skills')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'skills' ? 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]' : 'hover:bg-white/5'}`}
              >
                <Cpu size={18} />
                <span>技能 & 提示词</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('tools')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'tools' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'hover:bg-white/5'}`}
              >
                <Wrench size={18} />
                <span>工具总览</span>
              </button>
            </li>
          </ul>
        </div>
        
        <div className="p-4 border-t border-[var(--border-color)]">
          <button 
            onClick={onExit}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--text-primary)]/5 hover:bg-[var(--text-primary)]/10 transition-colors text-[var(--text-secondary)]"
          >
            <ArrowLeft size={16} />
            退出管理台
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative bg-[url('/grid.svg')] bg-repeat bg-opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg-dark)]/80 pointer-events-none transition-colors duration-300"></div>
        <div className="relative z-10 h-full">
          {activeTab === 'config' && <ConfigManager />}
          {activeTab === 'skills' && <SkillsManager />}
          {activeTab === 'tools' && <ToolsViewer />}
        </div>
      </div>
    </div>
  );
}
