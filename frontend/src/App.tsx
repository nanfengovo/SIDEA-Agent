import React, { useState, useEffect, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import TracePanel from './components/TracePanel';
import { Activity, Sun, Moon, Cpu, Database, Languages, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './store';
import { ConfigProvider, theme as antdTheme, Select } from 'antd';
import AdminLayout from './pages/admin/AdminLayout';
import HistorySidebar from './components/history/HistorySidebar';
import { motion, AnimatePresence } from 'framer-motion';
import type { TraceEvent } from './types';
import { v4 as uuidv4 } from 'uuid';
import './i18n';
import './index.css';
import 'antd/dist/reset.css';

function App() {
  const { t, i18n } = useTranslation();
  const { theme, language, toggleTheme, setLanguage } = useAppStore();
  const [events, setEvents] = useState<TraceEvent[]>([]);
  
  // Resizable panels state
  const [leftWidth, setLeftWidth] = useState(40); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'admin'>('chat');
  
  // Skill & Model state
  const [skills, setSkills] = useState<{skill_id: string, skill_name: string}[]>([]);
  const [currentSkill, setCurrentSkill] = useState('plc_diagnostics');
  const [currentModel, setCurrentModel] = useState('gemma4:e2b-it-qat');
  const [currentSessionId, setCurrentSessionId] = useState<string>(uuidv4());

  useEffect(() => {
    i18n.changeLanguage(language);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, language, i18n]);

  useEffect(() => {
    // Fetch available skills (roles)
    fetch('http://localhost:8000/api/skills')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSkills(data);
          // If plc_diagnostics doesn't exist, select the first one
          if (!data.find(s => s.skill_id === 'plc_diagnostics')) {
            setCurrentSkill(data[0].skill_id);
          }
        }
      })
      .catch(console.error);
      
    // Fetch config to get current model
    fetch('http://localhost:8000/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.LLM_MODEL_NAME) {
          setCurrentModel(data.LLM_MODEL_NAME.config_value);
        }
      })
      .catch(console.error);
  }, []);

  const handleModelChange = (val: string) => {
    setCurrentModel(val);
    fetch('http://localhost:8000/api/config/LLM_MODEL_NAME', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_value: val, category: 'llm' })
    }).catch(console.error);
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
      <div className="flex flex-col h-screen w-full box-border text-[var(--text-primary)] font-sans transition-colors duration-300 relative overflow-hidden bg-[url('/grid.svg')] bg-repeat pl-12">
        <HistorySidebar 
          currentSessionId={currentSessionId}
          onSelectSession={(id) => setCurrentSessionId(id)}
          onNewSession={() => setCurrentSessionId(uuidv4())}
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
            {/* Model Selector */}
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-blue)]" />
              <span className="text-sm text-[var(--text-secondary)]">{t('label_model')}</span>
              <Select 
                value={currentModel} 
                onChange={handleModelChange}
                style={{ width: 160 }}
                options={[
                  { value: 'gemma4:e2b-it-qat', label: 'Gemma-4 QAT' },
                  { value: 'llama3:8b-instruct', label: 'Llama3 8B' },
                  { value: 'qwen2:7b', label: 'Qwen2 7B' },
                  { value: 'mistral', label: 'Mistral 7B' }
                ]}
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

            <button onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')} className="p-2 rounded-full hover:bg-[var(--accent-cyan)]/20 transition-colors" title="Switch Language">
              <Languages size={18} className="text-[var(--accent-cyan)]" />
            </button>
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-[var(--accent-cyan)]/20 transition-colors" title="Toggle Theme">
              <AnimatePresence mode="wait">
                {theme === 'dark' ? (
                  <motion.div key="dark" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Sun size={18} className="text-[#fadb14]" /></motion.div>
                ) : (
                  <motion.div key="light" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Moon size={18} className="text-[#1890ff]" /></motion.div>
                )}
              </AnimatePresence>
            </button>
            <button onClick={() => setViewMode('admin')} className="p-2 rounded-full hover:bg-[var(--accent-purple)]/20 transition-colors" title="Admin Dashboard">
              <Settings size={18} className="text-[var(--accent-purple)]" />
            </button>
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
            <ChatPanel onEvent={handleNewEvent} onClear={clearEvents} skillId={currentSkill} sessionId={currentSessionId} />
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
        ) : (
          <AdminLayout onExit={() => setViewMode('chat')} />
        )}
      </div>
    </ConfigProvider>
  );
}

export default App;
