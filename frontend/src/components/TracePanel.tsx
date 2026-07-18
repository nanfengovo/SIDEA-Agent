import React, { useEffect, useRef, useState } from 'react';
import type { TraceEvent } from '../types';
import { 
  Code, Terminal, Brain, Wrench, CheckCircle, AlertTriangle, 
  User, Play, Zap, Loader2, ChevronDown, ChevronRight, Check, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const colorizeJSON = (obj: any) => {
  const jsonStr = JSON.stringify(obj, null, 2);
  const html = jsonStr.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-green-400';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = 'text-purple-400';
        else cls = 'text-yellow-300';
      } else if (/true|false/.test(match)) {
        cls = 'text-pink-400';
      } else if (/null/.test(match)) {
        cls = 'text-gray-500';
      } else {
        cls = 'text-cyan-400';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
  return `<pre class="text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">${html}</pre>`;
};

interface TracePanelProps {
  events: TraceEvent[];
}

interface TraceNode {
  id: string;
  type: 'user' | 'agent' | 'tool' | 'output';
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  latency?: number;
  data?: any;
  startTime?: number;
}

export default function TracePanel({ events }: TracePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'flow' | 'logs'>('flow');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [logs, setLogs] = useState<TraceEvent[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  useEffect(() => {
    const newNodes: TraceNode[] = [];
    if (events.length > 0) {
      newNodes.push({ id: 'start', type: 'user', label: '指令下发', status: 'success' });
    }

    let currentToolStart: TraceEvent | null = null;
    let agentStarted = false;

    events.forEach(e => {
       if (e.type === 'llm_start' || e.type === 'agent_start') {
          agentStarted = true;
          newNodes.push({ id: 'agent', type: 'agent', label: 'AI 推理中', status: 'running', startTime: e.timestamp });
       }
       else if (e.type === 'tool_start') {
          const agentNodes = newNodes.filter(n => n.type === 'agent');
          if (agentNodes.length > 0) agentNodes[agentNodes.length - 1].status = 'success';
          
          currentToolStart = e;
          newNodes.push({
             id: e.id, 
             type: 'tool', 
             label: e.data?.name || '执行工具', 
             status: 'running', 
             data: e.data,
             startTime: e.timestamp
          });
       }
       else if (e.type === 'tool_end' || e.type === 'tool_error') {
          const node = newNodes.find(n => n.id === currentToolStart?.id);
          if (node) {
             node.status = e.type === 'tool_error' ? 'error' : 'success';
             if (node.startTime) {
                node.latency = e.timestamp - node.startTime;
             }
             node.data = { ...node.data, result: e.data };
          }
       }
       else if (e.type === 'stream_start') {
          const agentNodes = newNodes.filter(n => n.type === 'agent');
          if (agentNodes.length > 0) agentNodes[agentNodes.length - 1].status = 'success';
          const lastTool = newNodes.find(n => n.type === 'tool' && n.status === 'running');
          if (lastTool) lastTool.status = 'success';
          if (!newNodes.find(n => n.type === 'output')) {
             newNodes.push({ id: 'output', type: 'output', label: '流式生成诊断报告', status: 'running', startTime: e.timestamp });
          }
       }
       else if (e.type === 'stream_end' || e.type === 'llm_end') {
          const agentNodes = newNodes.filter(n => n.type === 'agent');
          if (agentNodes.length > 0) {
              const lastAgentNode = agentNodes[agentNodes.length - 1];
              if (lastAgentNode.status === 'running') {
                  lastAgentNode.status = 'success';
                  if (lastAgentNode.startTime && !lastAgentNode.latency) {
                      lastAgentNode.latency = e.timestamp - lastAgentNode.startTime;
                  }
              }
          }
          const outputNode = newNodes.find(n => n.type === 'output');
          if (outputNode) {
              outputNode.status = 'success';
              if (outputNode.startTime) outputNode.latency = e.timestamp - outputNode.startTime;
          }
       }
    });

    setNodes(newNodes);
    
    const filteredLogs = events.filter(e => e.type !== 'llm_token' && e.type !== 'stream_start' && e.type !== 'stream_end');
    setLogs(filteredLogs);
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] rounded-xl border border-[var(--border-color)]/50 overflow-hidden relative shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]">
      {/* Background Cyber Grid & Scanner */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none mix-blend-overlay z-0"></div>
      <motion.div 
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-20 shadow-[0_0_15px_var(--accent-cyan)] pointer-events-none z-0"
        animate={{ top: ['-10%', '110%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 bg-[var(--accent-cyan)] rounded-full shadow-[0_0_8px_var(--accent-cyan)]"
            initial={{ 
              left: `${Math.random() * 100}%`, 
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.1
            }}
            animate={{ 
              y: [0, Math.random() * -200 - 100],
              opacity: [null, 0]
            }}
            transition={{ 
              duration: Math.random() * 5 + 5,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <div className="flex border-b border-[var(--border-color)]/30 bg-[#12121a]/80 backdrop-blur-xl relative z-10">
        <button 
          onClick={() => setActiveTab('flow')}
          className={`flex-1 py-3.5 font-bold text-sm tracking-widest transition-all duration-300 relative ${activeTab === 'flow' ? 'text-[var(--accent-cyan)] shadow-[0_0_20px_rgba(0,242,254,0.1)] bg-[var(--accent-cyan)]/5' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'}`}
        >
          {t('trace_flow') || '可视化链路'}
          {activeTab === 'flow' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-cyan)] shadow-[0_0_15px_var(--accent-cyan)]"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-3.5 font-bold text-sm tracking-widest transition-all duration-300 relative ${activeTab === 'logs' ? 'text-[var(--accent-cyan)] shadow-[0_0_20px_rgba(0,242,254,0.1)] bg-[var(--accent-cyan)]/5' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'}`}
        >
          {t('trace_logs') || '结构化日志'}
          {activeTab === 'logs' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-cyan)] shadow-[0_0_15px_var(--accent-cyan)]"></div>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth" ref={scrollRef}>
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--accent-cyan)]/30">
            <Brain size={64} className="mb-6 animate-pulse drop-shadow-[0_0_20px_rgba(0,242,254,0.5)]" />
            <p className="tracking-[0.3em] font-mono font-bold">{t('waiting_status') || 'AWAITING INSTRUCTIONS'}</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'flow' ? (
              <motion.div 
                key="flow"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="relative flex flex-col items-center py-4 w-full min-h-full"
              >
                {nodes.map((node, i) => (
                  <React.Fragment key={`${node.id}-${i}`}>
                    <FlowNode node={node} />
                    {i !== nodes.length - 1 && <AnimatedLine active={node.status === 'success' || node.status === 'running'} />}
                  </React.Fragment>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                key="logs"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {logs.map((e, idx) => (
                  <LogCard key={idx} event={e} />
                ))}
                {events.some(e => e.type === 'llm_token') && (
                  <div className="flex items-center gap-3 p-4 border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5 rounded-xl shadow-[0_0_15px_rgba(0,242,254,0.1)]">
                    <Loader2 className="w-5 h-5 text-[var(--accent-cyan)] animate-spin" />
                    <span className="font-mono text-sm text-[var(--accent-cyan)] tracking-wider">正在流式渲染报告...</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function FlowNode({ node }: { node: TraceNode }) {
  const isRunning = node.status === 'running';
  const isError = node.status === 'error';
  const isSuccess = node.status === 'success';

  let borderGlow = 'border-white/10 text-gray-400 shadow-none';
  let innerBg = 'bg-[#12121a]';

  if (isRunning) {
    borderGlow = 'border-[var(--accent-purple)] text-[var(--accent-purple)] shadow-[0_0_30px_rgba(179,0,255,0.4)] animate-pulse';
    innerBg = 'bg-[#1e1033]';
  } else if (isError) {
    borderGlow = 'border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]';
    innerBg = 'bg-[#331010]';
  } else if (isSuccess) {
    borderGlow = 'border-[var(--accent-cyan)] text-[var(--accent-cyan)] shadow-[0_0_15px_rgba(0,242,254,0.2)]';
    innerBg = 'bg-[#102033]';
  }

  const getIcon = () => {
    if (node.type === 'user') return <User size={22} />;
    if (node.type === 'agent') return <Brain size={22} />;
    if (node.type === 'tool') return <Wrench size={22} />;
    return <Play size={22} />;
  };

  return (
    <motion.div 
      initial={{ scale: 0.8, opacity: 0, y: -20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      className="relative z-10"
    >
      <div className={`
        relative flex items-center justify-center gap-4 px-6 py-4 rounded-2xl border-2 min-w-[240px] max-w-[300px]
        backdrop-blur-xl overflow-hidden transition-all duration-500
        ${borderGlow} ${innerBg}
      `}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded-xl"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
        
        <div className="relative z-10 flex items-center justify-center bg-black/40 p-2 rounded-lg border border-white/5">
           {getIcon()}
        </div>
        
        <span className="font-bold tracking-widest text-sm z-10 uppercase flex-1 truncate">{node.label}</span>

        {isSuccess && <Check size={18} className="text-green-400 z-10" />}
        {isRunning && <Loader2 size={18} className="animate-spin z-10" />}

        {node.latency !== undefined && (
          <div className="absolute -right-3 -top-3 bg-black border border-[var(--accent-cyan)]/50 text-[10px] text-[var(--accent-cyan)] font-mono px-2 py-0.5 rounded-full z-20 shadow-[0_0_10px_rgba(0,242,254,0.3)]">
            {node.latency}ms
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AnimatedLine({ active }: { active: boolean }) {
  return (
    <div className="w-1 h-12 relative overflow-hidden flex justify-center z-0">
      <div className={`w-[2px] h-full transition-colors duration-500 ${active ? 'bg-[var(--accent-cyan)]/20' : 'bg-gray-800'}`}></div>
      {active && (
        <>
          <motion.div 
            className="absolute top-0 w-1.5 h-4 bg-white rounded-full shadow-[0_0_10px_#fff,0_0_20px_var(--accent-cyan)]"
            animate={{ top: ['-20%', '120%'] }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          />
          <motion.div 
            className="absolute top-0 w-1 h-2 bg-[var(--accent-blue)] rounded-full shadow-[0_0_8px_var(--accent-blue)]"
            animate={{ top: ['-20%', '120%'] }}
            transition={{ repeat: Infinity, duration: 1, delay: 0.3, ease: "linear" }}
          />
          <motion.div 
            className="absolute top-0 w-1 h-2 bg-[var(--accent-purple)] rounded-full shadow-[0_0_8px_var(--accent-purple)]"
            animate={{ top: ['-20%', '120%'] }}
            transition={{ repeat: Infinity, duration: 1, delay: 0.6, ease: "linear" }}
          />
        </>
      )}
    </div>
  );
}

function LogCard({ event }: { event: TraceEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const isTool = event.type === 'tool_start' || event.type === 'tool_end';
  const isError = event.type === 'tool_error';
  
  let icon = <Terminal size={18} className="text-gray-400" />;
  if (isTool) icon = <Wrench size={18} className="text-[var(--accent-blue)]" />;
  if (isError) icon = <AlertTriangle size={18} className="text-red-500" />;
  if (event.type === 'llm_start' || event.type === 'agent_start') icon = <Brain size={18} className="text-[var(--accent-purple)]" />;
  if (event.type === 'session_info') icon = <Database size={18} className="text-[var(--accent-cyan)]" />;

  const title = event.type.replace('_', ' ').toUpperCase();
  const time = new Date(event.timestamp || Date.now()).toLocaleTimeString();

  return (
    <div className={`group bg-[#151521] border ${event.type === 'session_info' ? 'border-[var(--accent-cyan)]/30 shadow-[0_0_15px_rgba(0,242,254,0.1)]' : 'border-white/5'} rounded-xl overflow-hidden hover:border-[var(--accent-cyan)]/40 transition-colors shadow-lg`}>
      <div 
        className="flex items-center gap-3 p-3.5 cursor-pointer select-none bg-white/5 hover:bg-white/10 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 shadow-inner">
          {icon}
        </div>
        <span className="font-mono font-bold text-sm tracking-wider text-white/90">{title}</span>
        
        {event.data?.name && (
          <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 truncate max-w-[150px]">
            {event.data.name}
          </span>
        )}

        <span className="ml-auto text-xs font-mono text-gray-500">{time}</span>
        {isOpen ? <ChevronDown size={16} className="text-gray-500 ml-2" /> : <ChevronRight size={16} className="text-gray-500 ml-2" />}
      </div>

      <AnimatePresence>
        {isOpen && event.data && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-black/80 border-t border-white/5 relative">
               <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/30 to-transparent"></div>
               <div dangerouslySetInnerHTML={{ __html: colorizeJSON({ ...event.data, details: undefined }) }} />
               {event.data.details && Array.isArray(event.data.details) && (
                 <div className="mt-4 flex flex-col gap-2">
                   <div className="text-xs text-[var(--accent-cyan)] font-bold mb-1 border-b border-white/10 pb-1">详细内容 (Details)</div>
                   {event.data.details.map((detail: any, i: number) => (
                     <details key={i} className="group/detail border border-white/10 rounded-lg bg-[#1a1b26] overflow-hidden shadow-inner">
                       <summary className="p-2.5 text-xs text-white cursor-pointer select-none font-medium bg-black/40 hover:bg-white/10 transition-colors flex items-center justify-between">
                         <span>{detail.title || `Item ${i + 1}`}</span>
                         <span className="text-gray-500 text-[10px] opacity-0 group-hover/detail:opacity-100 transition-opacity">展开/折叠</span>
                       </summary>
                       <div className="p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 border-t border-white/5 bg-[#0a0a0f]">
                         {detail.content}
                       </div>
                     </details>
                   ))}
                 </div>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
