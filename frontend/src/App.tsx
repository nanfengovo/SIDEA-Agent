import React, { useState, useEffect, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import TracePanel from './components/TracePanel';
import { Activity, Sun, Moon, Cpu, Database, Languages, Settings, BookOpen, Check, Zap, ZapOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore, toI18nLng } from './store';
import type { AppLanguage } from './store';
import { ConfigProvider, theme as antdTheme, Select, Tooltip, App as AntdApp } from 'antd';
import AdminLayout from './pages/admin/AdminLayout';
import KnowledgePanel from './components/KnowledgePanel';
import HistorySidebar from './components/history/HistorySidebar';
import SystemLogsPanel from './components/SystemLogsPanel';
import { motion, AnimatePresence } from 'framer-motion';
import type { TraceEvent } from './types';
import { v4 as uuidv4 } from 'uuid';
import './i18n';
import './index.css';
import 'antd/dist/reset.css';
import { getApiUrl } from './config';

function App() {
  const { t, i18n } = useTranslation();
  const { theme, language, enableAnimations, toggleTheme, setLanguage, toggleAnimations } = useAppStore();
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  
  // Resizable panels state
  const [leftWidth, setLeftWidth] = useState(70); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'admin' | 'knowledge' | 'system_logs'>('chat');
  const [systemLogRuleId, setSystemLogRuleId] = useState<string | null>(null);
  
  // Skill & Model state
  const [skills, setSkills] = useState<{skill_id: string, skill_name: string}[]>([]);
  const [currentSkill, setCurrentSkill] = useState('plc_diagnostics');
  const [llmProfiles, setLlmProfiles] = useState<{profile_id: string; name: string; model_name: string; provider: string; is_active?: boolean}[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  const [permissionMode, setPermissionMode] = useState('ask_always');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('sidea_session_id') || uuidv4();
  });
  const [sessionRefreshTrigger, setSessionRefreshTrigger] = useState(0);

  useEffect(() => {
    i18n.changeLanguage(toI18nLng(language));
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, language, i18n]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-app-lang-menu]')) return;
      setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langMenuOpen]);

  const APP_LANG_OPTIONS: { value: AppLanguage; label: string }[] = [
    { value: 'zh', label: '简中' },
    { value: 'zh-TW', label: '繁中' },
    { value: 'en', label: 'EN' },
    { value: 'ja', label: '日文' },
  ];

  useEffect(() => {
    localStorage.setItem('sidea_session_id', currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    // Fetch available skills (roles)
    fetch(`${getApiUrl()}/admin/skills`)
      .then(res => res.json())
      .then(data => {
        const skillsArray = data.items || data;
        if (Array.isArray(skillsArray) && skillsArray.length > 0) {
          const enabledSkills = skillsArray.filter(s => s.is_enabled === 1);
          setSkills(enabledSkills.length > 0 ? enabledSkills : skillsArray);
          // If plc_diagnostics doesn't exist, select the first one
          if (!skillsArray.find(s => s.skill_id === 'plc_diagnostics')) {
            setCurrentSkill(skillsArray[0].skill_id);
          }
        }
      })
      .catch(console.error);

    // Fetch enabled LLM profiles for top selector
    fetch(`${getApiUrl()}/admin/llm/profiles?enabled=1`)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setLlmProfiles(data);
        const active = data.find((p: any) => p.is_active) || data[0];
        if (active) setCurrentProfileId(active.profile_id);
      })
      .catch(console.error);
  }, []);

  const handleModelChange = (profileId: string) => {
    setCurrentProfileId(profileId);
    fetch(`${getApiUrl()}/admin/llm/profiles/${profileId}/activate`, {
      method: 'POST',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        // refresh list so is_active flags stay consistent
        const listRes = await fetch(`${getApiUrl()}/admin/llm/profiles?enabled=1`);
        const list = await listRes.json();
        if (Array.isArray(list)) setLlmProfiles(list);
      })
      .catch(console.error);
  };

  const handleNewEvent = (event: TraceEvent) => {
    setEvents((prev) => [...prev, event]);
  };

  const clearEvents = () => setEvents([]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newWidth = (e.clientX / window.innerWidth) * 100;
    if (newWidth > 20 && newWidth < 80) {
      setLeftWidth(newWidth);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#00f2fe' }
      }}
    >
      <AntdApp>
        <div className="flex flex-col h-screen w-full box-border text-[var(--text-primary)] font-sans transition-colors duration-300 relative overflow-hidden bg-[url('/grid.svg')] bg-repeat pl-12">
        <HistorySidebar 
          currentSessionId={currentSessionId}
          onSelectSession={(id) => setCurrentSessionId(id)}
          onNewSession={() => setCurrentSessionId(uuidv4())}
          refreshTrigger={sessionRefreshTrigger}
        />
        
        {/* Top Navigation Bar */}
        {viewMode === 'chat' && (
        <div className="h-16 border-b border-[var(--border-color)] glass-panel rounded-none shadow-md flex items-center px-6 justify-between z-20 shrink-0">
          <div className="flex items-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }} className="relative">
              <div className="absolute inset-0 bg-[var(--accent-cyan)] blur-md opacity-50 rounded-full"></div>
              <Activity className="w-6 h-6 text-[var(--accent-cyan)] relative z-10" />
            </motion.div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] m-0 glow-text tracking-wide">
              {t('app_title') || 'SIDEA 智能体'}
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Model Selector — from enabled LLM Provider Profiles，按提供商分组 */}
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-blue)]" />
              <span className="text-sm text-[var(--text-secondary)]">{t('label_model')}</span>
              <Select 
                value={currentProfileId || undefined} 
                onChange={handleModelChange}
                style={{ width: 260 }}
                placeholder="选择模型"
                options={(() => {
                  const labelMap: Record<string, string> = {
                    gemini_native: 'Google Gemini',
                    openai: 'OpenAI',
                    openai_compatible: 'OpenAI Compatible',
                    ollama: 'Ollama',
                  };
                  const order = ['gemini_native', 'openai', 'openai_compatible', 'ollama'];
                  const buckets: Record<string, typeof llmProfiles> = {};
                  for (const p of llmProfiles) {
                    (buckets[p.provider] ||= []).push(p);
                  }
                  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
                  for (const key of order) {
                    if (!buckets[key]?.length) continue;
                    groups.push({
                      label: labelMap[key] || key,
                      options: buckets[key].map((p) => ({
                        value: p.profile_id,
                        label: `${p.name} · ${p.model_name}`,
                      })),
                    });
                    delete buckets[key];
                  }
                  for (const [key, list] of Object.entries(buckets)) {
                    groups.push({
                      label: labelMap[key] || key,
                      options: list.map((p) => ({
                        value: p.profile_id,
                        label: `${p.name} · ${p.model_name}`,
                      })),
                    });
                  }
                  return groups;
                })()}
              />
            </div>
            
            {/* Role/Skill Selector */}
            <div className="flex items-center gap-2">
              <Database size={16} className="text-[var(--accent-purple)]" />
              <span className="text-sm text-[var(--text-secondary)]">{t('label_role')}</span>
              <Select 
                value={currentSkill} 
                onChange={setCurrentSkill}
                style={{ width: 160 }}
                options={skills.map(s => ({ value: s.skill_id, label: s.skill_name }))}
              />
            </div>

            <div className="h-6 w-px bg-[var(--border-color)] mx-2"></div>

            <div className="relative" data-app-lang-menu>
              <Tooltip title="Switch Language" placement="bottom">
                <button
                  onClick={() => setLangMenuOpen((v) => !v)}
                  className="p-2 rounded-full hover:bg-[var(--accent-cyan)]/20 transition-colors"
                >
                  <Languages size={18} className="text-[var(--accent-cyan)]" />
                </button>
              </Tooltip>
              {langMenuOpen && (
                <div className="absolute top-full right-0 mt-2 z-[100] min-w-[96px] rounded-lg border border-white/10 bg-[#1a1b26]/95 backdrop-blur-md shadow-xl py-1 overflow-hidden">
                  {APP_LANG_OPTIONS.map((opt) => {
                    const selected = language === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setLanguage(opt.value);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                          selected
                            ? 'bg-[var(--accent-cyan)]/25 text-white'
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        <span className="w-3.5 inline-flex justify-center">
                          {selected ? <Check size={12} className="text-[var(--accent-cyan)]" /> : null}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Tooltip title={enableAnimations ? "关闭大屏动画特效" : "开启大屏动画特效"} placement="bottom">
              <button onClick={toggleAnimations} className={`p-2 rounded-full transition-colors ${enableAnimations ? 'hover:bg-emerald-500/20' : 'hover:bg-gray-500/20'}`}>
                <AnimatePresence mode="wait">
                  {enableAnimations ? (
                    <motion.div key="on" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><Zap size={18} className="text-emerald-400" /></motion.div>
                  ) : (
                    <motion.div key="off" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><ZapOff size={18} className="text-gray-400" /></motion.div>
                  )}
                </AnimatePresence>
              </button>
            </Tooltip>
            <Tooltip title="Toggle Theme" placement="bottom">
              <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-[var(--accent-cyan)]/20 transition-colors">
                <AnimatePresence mode="wait">
                  {theme === 'dark' ? (
                    <motion.div key="dark" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Sun size={18} className="text-[#fadb14]" /></motion.div>
                  ) : (
                    <motion.div key="light" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Moon size={18} className="text-[#1890ff]" /></motion.div>
                  )}
                </AnimatePresence>
              </button>
            </Tooltip>
            <Tooltip title="知识库管理" placement="bottom">
              <button onClick={() => setViewMode('knowledge')} className="p-2 rounded-full hover:bg-[var(--accent-blue)]/20 transition-colors">
                <BookOpen size={18} className="text-[var(--accent-blue)]" />
              </button>
            </Tooltip>
            <Tooltip title="系统日志追踪" placement="bottom">
              <button onClick={() => setViewMode('system_logs')} className="p-2 rounded-full hover:bg-emerald-500/20 transition-colors">
                <Activity size={18} className="text-emerald-400" />
              </button>
            </Tooltip>
            <Tooltip title="Admin Dashboard" placement="bottom">
              <button onClick={() => setViewMode('admin')} className="p-2 rounded-full hover:bg-[var(--accent-purple)]/20 transition-colors">
                <Settings size={18} className="text-[var(--accent-purple)]" />
              </button>
            </Tooltip>
          </div>
        </div>
        )}

        {/* Main Content Area */}
        {viewMode === 'chat' ? (
        <div className="flex flex-1 overflow-hidden p-4">
          {/* Left Chat Panel */}
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{ width: `${leftWidth}%` }}
            className="flex flex-col glass-panel p-5 relative overflow-hidden h-full z-10"
          >
            <ChatPanel 
              onEvent={handleNewEvent} 
              onClear={clearEvents} 
              onLoadTrace={(events) => setEvents(events)}
              skillId={currentSkill} 
              sessionId={currentSessionId} 
              onMessageSent={() => setSessionRefreshTrigger(prev => prev + 1)}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
            />
          </motion.div>
          
          {/* Draggable Resizer */}
          <div 
            className="w-4 cursor-col-resize flex flex-col justify-center items-center group z-20 h-full mx-1"
            onMouseDown={handleMouseDown}
          >
            <div className={`w-1 h-16 rounded-full transition-all duration-300 ${isDragging ? 'bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)]' : 'bg-[var(--border-color)] group-hover:bg-[var(--accent-cyan)]'}`}></div>
          </div>

          {/* Right Trace Panel */}
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ width: `calc(${100 - leftWidth}% - 1.5rem)` }}
            className="glass-panel p-5 overflow-hidden flex flex-col h-full z-10"
          >
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-cyan)] mb-4 m-0 flex items-center gap-3 tracking-wide shrink-0">
              <span className="w-3 h-3 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)] animate-pulse"></span>
              {t('execution_trace') || "执行链路追踪"}
            </h2>
            <div className="flex-1 overflow-hidden">
              <TracePanel events={events} />
            </div>
          </motion.div>
        </div>
        ) : viewMode === 'admin' ? (
          <AdminLayout onExit={() => setViewMode('chat')} />
        ) : viewMode === 'knowledge' ? (
          <KnowledgePanel 
            onExit={() => setViewMode('chat')} 
            onOpenLogs={(ruleId) => {
              setSystemLogRuleId(ruleId || null);
              setViewMode('system_logs');
            }} 
          />
        ) : (
          <SystemLogsPanel 
            onExit={() => setViewMode('chat')} 
            initialRuleId={systemLogRuleId}
          />
        )}
      </div>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
