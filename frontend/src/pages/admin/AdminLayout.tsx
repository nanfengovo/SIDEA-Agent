import React, { useState } from 'react';
import { Settings, Cpu, Wrench, ArrowLeft, Cable, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfigManager from './ConfigManager';
import SkillsManager from './SkillsManager';
import ToolsViewer from './ToolsViewer';
import RcsConnectorManager from './RcsConnectorManager';
import LlmProviderManager from './LlmProviderManager';

interface AdminLayoutProps {
  onExit: () => void;
}

export default function AdminLayout({ onExit }: AdminLayoutProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('config');

  const navItems = [
    { key: 'config', icon: <Settings size={18} />, label: t('nav_config'), accent: 'cyan' },
    { key: 'llm', icon: <Brain size={18} />, label: t('nav_llm') || '模型连接器', accent: 'purple' },
    { key: 'rcs', icon: <Cable size={18} />, label: t('nav_rcs') || 'RCS 连接器', accent: 'blue' },
    { key: 'skills', icon: <Cpu size={18} />, label: t('nav_skills'), accent: 'purple' },
    { key: 'tools', icon: <Wrench size={18} />, label: t('nav_tools'), accent: 'blue' },
  ] as const;

  const accentClass: Record<string, string> = {
    cyan: 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]',
    purple: 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]',
    blue: 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]',
  };

  return (
    <div className="flex h-screen w-full bg-[var(--bg-dark)] text-[var(--text-primary)] transition-colors duration-300">
      <div className="w-64 border-r border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col shrink-0 transition-colors duration-300">
        <div className="h-16 flex items-center px-6 border-b border-[var(--border-color)] justify-between">
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] m-0 glow-text">
            {t('admin_console')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveTab(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeTab === item.key ? accentClass[item.accent] : 'hover:bg-white/5'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-[var(--border-color)]">
          <button
            onClick={onExit}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--text-primary)]/5 hover:bg-[var(--text-primary)]/10 transition-colors text-[var(--text-secondary)]"
          >
            <ArrowLeft size={16} />
            {t('exit_admin')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-[url('/grid.svg')] bg-repeat bg-opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg-dark)]/80 pointer-events-none transition-colors duration-300"></div>
        <div className="relative z-10 h-full">
          {activeTab === 'config' && <ConfigManager />}
          {activeTab === 'llm' && <LlmProviderManager />}
          {activeTab === 'rcs' && <RcsConnectorManager />}
          {activeTab === 'skills' && <SkillsManager />}
          {activeTab === 'tools' && <ToolsViewer />}
        </div>
      </div>
    </div>
  );
}
