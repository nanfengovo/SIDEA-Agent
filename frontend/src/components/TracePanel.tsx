import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import type { TraceEvent } from '../types';
import { Code, Terminal, Brain, Wrench, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface TracePanelProps {
  events: TraceEvent[];
}

export default function TracePanel({ events }: TracePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'flow' | 'logs'>('flow');
  const scrollRef = useRef<HTMLDivElement>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#00f2fe',
        primaryTextColor: '#fff',
        primaryBorderColor: '#00f2fe',
        lineColor: '#4facfe',
        secondaryColor: '#b300ff',
        tertiaryColor: '#151521'
      }
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'flow' && mermaidRef.current && events.length > 0) {
      const tools = events.filter(e => e.type === 'tool_start');
      
      let diagram = 'graph TD\n';
      diagram += '  User([用户])\n';
      diagram += '  Agent((智能体))\n';
      diagram += '  Output([输出响应])\n';
      
      diagram += '  User -->|发起请求| Agent\n';
      
      if (tools.length > 0) {
        tools.forEach((t, i) => {
          const toolName = t.data?.name || `Tool_${i}`;
          diagram += `  Agent -->|调用工具| ${toolName}[${toolName}]\n`;
          diagram += `  ${toolName} -.->|返回结果| Agent\n`;
          diagram += `  style ${toolName} fill:#151521,stroke:#00f2fe,stroke-width:2px,color:#fff,stroke-dasharray: 5 5\n`;
        });
      } else {
        diagram += '  Agent -.->|直接思考| Agent\n';
      }
      
      diagram += '  Agent -->|生成回答| Output\n';
      
      diagram += '  style User fill:#151521,stroke:#4facfe,stroke-width:2px,color:#fff\n';
      diagram += '  style Agent fill:#151521,stroke:#b300ff,stroke-width:3px,color:#fff\n';
      diagram += '  style Output fill:#151521,stroke:#00f2fe,stroke-width:2px,color:#fff\n';

      mermaid.render('mermaid-svg', diagram).then((result) => {
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = result.svg;
        }
      }).catch(err => console.error(err));
    }
  }, [events, activeTab]);

  const renderEventIcon = (type: string) => {
    switch(type) {
      case 'agent_start': return <Brain className="text-[var(--accent-purple)] w-5 h-5" />;
      case 'tool_start': return <Wrench className="text-[var(--accent-blue)] w-5 h-5" />;
      case 'tool_end': return <CheckCircle className="text-[var(--accent-cyan)] w-5 h-5" />;
      case 'tool_error': return <AlertTriangle className="text-red-500 w-5 h-5" />;
      case 'llm_token': return <Terminal className="text-gray-400 w-5 h-5" />;
      default: return <Code className="text-gray-500 w-5 h-5" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)]/30 overflow-hidden relative">
      <div className="flex border-b border-[var(--border-color)]/50 bg-[var(--bg-panel)] backdrop-blur-md">
        <button 
          onClick={() => setActiveTab('flow')}
          className={`flex-1 py-3 font-semibold text-sm transition-all duration-300 relative ${activeTab === 'flow' ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          {t('trace_flow') || '可视化链路'}
          {activeTab === 'flow' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)]"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-3 font-semibold text-sm transition-all duration-300 relative ${activeTab === 'logs' ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          {t('trace_logs') || '流式日志'}
          {activeTab === 'logs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)]"></div>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] opacity-50">
            <Brain size={48} className="mb-4 animate-pulse" />
            <p className="tracking-widest">{t('waiting_status')}</p>
          </div>
        ) : (
          <>
            {activeTab === 'flow' && (
              <div className="h-full flex items-center justify-center min-h-[300px]">
                <div ref={mermaidRef} className="mermaid w-full flex justify-center drop-shadow-[0_0_15px_rgba(0,242,254,0.2)]"></div>
              </div>
            )}
            
            {activeTab === 'logs' && (
              <div className="space-y-3 font-mono text-sm">
                <AnimatePresence>
                  {events.map((e, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-[var(--bg-panel)] border border-[var(--border-color)]/40 rounded-lg p-3 hover:border-[var(--accent-cyan)]/60 transition-colors shadow-sm group"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-1.5 rounded-md bg-[var(--text-primary)]/5 group-hover:bg-[var(--accent-cyan)]/10 transition-colors">
                           {renderEventIcon(e.type)}
                        </div>
                        <span className="font-bold text-[var(--text-primary)] tracking-wide uppercase">{e.type.replace('_', ' ')}</span>
                        <span className="text-xs text-[var(--text-secondary)] ml-auto bg-[var(--text-primary)]/5 px-2 py-1 rounded">
                          {new Date(e.timestamp || Date.now()).toLocaleTimeString()}
                        </span>
                      </div>
                      {e.data && e.type !== 'llm_token' && (
                        <pre className="mt-2 text-xs text-[var(--accent-cyan)]/80 bg-black/40 p-3 rounded-md overflow-x-auto border border-white/5 whitespace-pre-wrap">
                          {JSON.stringify(e.data, null, 2)}
                        </pre>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
