import React, { useEffect, useRef, useState } from 'react';
import type { TraceEvent } from '../types';
import { 
  Code, Terminal, Brain, Wrench, AlertTriangle, 
  User, Play, Loader2, ChevronDown, ChevronRight, Check, Database, X, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

const colorizeJSON = (obj: any, isDark: boolean) => {
  const jsonStr = JSON.stringify(obj, null, 2);
  const html = jsonStr.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = isDark ? 'text-green-400' : 'text-green-700';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = isDark ? 'text-purple-400' : 'text-purple-700';
        else cls = isDark ? 'text-yellow-300' : 'text-yellow-600';
      } else if (/true|false/.test(match)) {
        cls = isDark ? 'text-pink-400' : 'text-pink-600';
      } else if (/null/.test(match)) {
        cls = 'text-gray-500';
      } else {
        cls = isDark ? 'text-cyan-400' : 'text-cyan-700';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
  return `<pre class="text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin ${isDark ? 'scrollbar-thumb-white/10' : 'scrollbar-thumb-black/10'}">${html}</pre>`;
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

interface TraceLayer {
  id: string;
  type: 'user' | 'agent' | 'tools' | 'output';
  nodes: TraceNode[];
}

function FlowConnections({ layers, containerRef }: { layers: TraceLayer[], containerRef: React.RefObject<HTMLDivElement | null> }) {
    const [paths, setPaths] = useState<{id: string, d: string, active: boolean, isError: boolean}[]>([]);
    
    useEffect(() => {
        const updatePaths = () => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newPaths = [];
            
            for (let i = 0; i < layers.length - 1; i++) {
                const currentLayer = layers[i];
                const nextLayer = layers[i+1];
                
                for (const node1 of currentLayer.nodes) {
                    const el1 = document.getElementById(node1.id);
                    if (!el1) continue;
                    const rect1 = el1.getBoundingClientRect();
                    const x1 = rect1.left + rect1.width / 2 - containerRect.left;
                    const y1 = rect1.top + rect1.height - containerRect.top;
                    
                    for (const node2 of nextLayer.nodes) {
                        const el2 = document.getElementById(node2.id);
                        if (!el2) continue;
                        const rect2 = el2.getBoundingClientRect();
                        const x2 = rect2.left + rect2.width / 2 - containerRect.left;
                        const y2 = rect2.top - containerRect.top;
                        
                        // bezier curve
                        newPaths.push({
                            id: `${node1.id}-${node2.id}`,
                            d: `M ${x1} ${y1} C ${x1} ${(y1+y2)/2}, ${x2} ${(y1+y2)/2}, ${x2} ${y2}`,
                            active: node2.status === 'running' || node2.status === 'success' || node2.status === 'error',
                            isError: node2.status === 'error'
                        });
                    }
                }
            }
            setPaths(newPaths);
        };
        
        updatePaths();
        window.addEventListener('resize', updatePaths);
        const interval = setInterval(updatePaths, 100); 
        return () => {
            window.removeEventListener('resize', updatePaths);
            clearInterval(interval);
        };
    }, [layers, containerRef]);
    
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
            {paths.map(p => (
                <path 
                   key={p.id} 
                   d={p.d} 
                   fill="none" 
                   stroke={p.isError ? "rgba(239,68,68,0.5)" : (p.active ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.1)")} 
                   strokeWidth={2}
                   className={`transition-all duration-500 ${p.active ? 'drop-shadow-[0_0_8px_rgba(0,242,254,0.5)]' : ''}`}
                />
            ))}
            {paths.filter(p => p.active).map(p => (
                <circle key={`${p.id}-particle`} r={3} fill={p.isError ? "#ef4444" : "#00f2fe"} className={p.isError ? "drop-shadow-[0_0_10px_#ef4444]" : "drop-shadow-[0_0_10px_#00f2fe]"}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" path={p.d} />
                </circle>
            ))}
        </svg>
    );
}

export default function TracePanel({ events }: TracePanelProps) {
  const { t } = useTranslation();
  const { theme } = useAppStore();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'flow' | 'logs'>('flow');
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<TraceNode | null>(null);

  const [layers, setLayers] = useState<TraceLayer[]>([]);
  const [logs, setLogs] = useState<TraceEvent[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  useEffect(() => {
    const newLayers: TraceLayer[] = [];
    if (events.length > 0) {
      newLayers.push({
        id: 'layer-user',
        type: 'user',
        nodes: [{ id: 'node-user', type: 'user', label: '指令下发', status: 'success' }]
      });
    }

    let currentAgentNode: TraceNode | null = null;
    let currentOutputNode: TraceNode | null = null;
    let agentCount = 0;

    events.forEach(e => {
      if (e.type === 'llm_start' || e.type === 'agent_start') {
        agentCount++;
        const agentNode: TraceNode = {
           id: `agent-${agentCount}-${e.id || Date.now()}`,
           type: 'agent',
           label: 'AI 推理中',
           status: 'running',
           startTime: e.timestamp,
           data: e.data
        };
        newLayers.push({
           id: `layer-agent-${agentCount}`,
           type: 'agent',
           nodes: [agentNode]
        });
        currentAgentNode = agentNode;
      }
      else if (e.type === 'tool_start') {
        if (currentAgentNode) currentAgentNode.status = 'success'; 
        
        let lastLayer = newLayers[newLayers.length - 1];
        if (!lastLayer || lastLayer.type !== 'tools') {
           lastLayer = { id: `layer-tools-${e.id || Date.now()}`, type: 'tools', nodes: [] };
           newLayers.push(lastLayer);
        }
        lastLayer.nodes.push({
           id: `tool-${e.id || Date.now()}-${Math.random()}`,
           type: 'tool',
           label: e.data?.name || '执行工具',
           status: 'running',
           startTime: e.timestamp,
           data: e.data
        });
      }
      else if (e.type === 'tool_end' || e.type === 'tool_error') {
        for (let i = newLayers.length - 1; i >= 0; i--) {
           if (newLayers[i].type === 'tools') {
              const tnode = newLayers[i].nodes.find(n => (n.id.includes(e.id) || n.label === e.data?.name) && n.status === 'running');
              if (tnode) {
                 tnode.status = e.type === 'tool_error' ? 'error' : 'success';
                 if (tnode.startTime) tnode.latency = e.timestamp - tnode.startTime;
                 tnode.data = { ...tnode.data, result: e.data };
                 
                 if (selectedNode && selectedNode.id === tnode.id) {
                     setSelectedNode({...tnode});
                 }
                 break;
              }
           }
        }
      }
      else if (e.type === 'stream_start') {
        if (currentAgentNode && currentAgentNode.status === 'running') currentAgentNode.status = 'success';
        for (let i = newLayers.length - 1; i >= 0; i--) {
           if (newLayers[i].type === 'tools') {
              newLayers[i].nodes.forEach(n => {
                 if (n.status === 'running') n.status = 'success';
              });
           }
        }
        
        currentOutputNode = {
           id: `output-${e.id || Date.now()}`,
           type: 'output',
           label: '流式生成响应',
           status: 'running',
           startTime: e.timestamp,
           data: e.data
        };
        newLayers.push({
           id: `layer-output`,
           type: 'output',
           nodes: [currentOutputNode]
        });
      }
      else if (e.type === 'stream_end' || e.type === 'llm_end') {
         if (currentAgentNode && currentAgentNode.status === 'running') {
             currentAgentNode.status = 'success';
             if (currentAgentNode.startTime && !currentAgentNode.latency) {
                 currentAgentNode.latency = e.timestamp - currentAgentNode.startTime;
             }
         }
         if (currentOutputNode) {
             currentOutputNode.status = 'success';
             if (currentOutputNode.startTime && !currentOutputNode.latency) {
                 currentOutputNode.latency = e.timestamp - currentOutputNode.startTime;
             }
         }
      }
      else if (e.type === 'run_summary') {
         if (currentAgentNode && currentAgentNode.status === 'running') currentAgentNode.status = 'success';
         if (currentOutputNode && currentOutputNode.status === 'running') currentOutputNode.status = 'success';
         const dur = e.data?.duration_sec != null ? `${e.data.duration_sec}s` : '';
         const tok = e.data?.tokens?.total != null ? `${e.data.tokens.total} tok` : '';
         newLayers.push({
           id: `layer-summary-${e.id || Date.now()}`,
           type: 'output',
           nodes: [{
             id: `summary-${e.id || Date.now()}`,
             type: 'output',
             label: `运行摘要 ${[dur, tok].filter(Boolean).join(' · ')}`.trim(),
             status: 'success',
             startTime: e.timestamp,
             latency: e.data?.duration_ms,
             data: e.data,
           }],
         });
      }
    });

    setLayers(newLayers);
    
    // Auto-update selected node data if it changed
    if (selectedNode) {
        const foundLayer = newLayers.find(l => l.nodes.some(n => n.id === selectedNode.id));
        if (foundLayer) {
            const foundNode = foundLayer.nodes.find(n => n.id === selectedNode.id);
            if (foundNode && JSON.stringify(foundNode) !== JSON.stringify(selectedNode)) {
                setSelectedNode({...foundNode});
            }
        }
    }
    
    const filteredLogs = events.filter(e => e.type !== 'llm_token' && e.type !== 'stream_start' && e.type !== 'stream_end');
    setLogs(filteredLogs);
  }, [events]);

  return (
    <div className={`flex flex-col h-full rounded-xl border border-[var(--border-color)]/50 overflow-hidden relative ${isDark ? 'bg-[#0a0a0f] shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]' : 'bg-[var(--bg-dark)] shadow-inner'}`}>
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

      <div className={`flex border-b border-[var(--border-color)]/30 backdrop-blur-xl relative z-20 ${isDark ? 'bg-[#12121a]/80' : 'bg-[var(--bg-panel)]'}`}>
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 scroll-smooth relative" ref={scrollRef}>
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
                <div ref={containerRef} className="relative w-full flex flex-col items-center pb-20">
                    <FlowConnections layers={layers} containerRef={containerRef} />
                    {layers.map((layer, idx) => (
                        <div key={layer.id} className="flex flex-row flex-wrap justify-center gap-12 my-10 z-10 w-full relative">
                            {layer.nodes.map(node => (
                                <FlowNode 
                                   key={node.id} 
                                   node={node} 
                                   onClick={() => setSelectedNode(node)} 
                                   isSelected={selectedNode?.id === node.id} 
                                />
                            ))}
                        </div>
                    ))}
                </div>
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
                {logs.map((e) => (
                  <LogCard key={e.id || e.timestamp} event={e} />
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

      {/* Slide-over Drawer for Node Details */}
      <AnimatePresence>
        {selectedNode && (
            <motion.div
               initial={{ x: '100%', opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               exit={{ x: '100%', opacity: 0 }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className={`absolute right-0 top-0 bottom-0 w-[400px] max-w-full backdrop-blur-2xl border-l border-[var(--accent-cyan)]/30 z-50 p-5 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] ${isDark ? 'bg-black/70' : 'bg-white/80'}`}
            >
               <div className="flex justify-between items-center mb-4 border-b border-[var(--accent-cyan)]/20 pb-4">
                  <h3 className="text-[var(--accent-cyan)] font-bold tracking-widest flex items-center gap-2">
                     {selectedNode.type === 'user' && <User size={20} />}
                     {selectedNode.type === 'agent' && <Brain size={20} />}
                     {selectedNode.type === 'tool' && <Wrench size={20} />}
                     {selectedNode.type === 'output' && <Play size={20} />}
                     {selectedNode.label}
                  </h3>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-[var(--accent-cyan)] transition-colors p-1 bg-black/20 rounded-full hover:bg-black/40">
                     <X size={18} />
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--accent-cyan)]/30 scroll-smooth pr-2">
                  <div className="flex gap-4 mb-4 bg-black/20 p-3 rounded-lg border border-white/5">
                      <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Status</span>
                          <span className={`text-sm font-bold ${selectedNode.status === 'success' ? 'text-green-400' : selectedNode.status === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>{selectedNode.status.toUpperCase()}</span>
                      </div>
                      {selectedNode.latency !== undefined && (
                          <div className="flex flex-col border-l border-white/10 pl-4">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Latency</span>
                              <span className="text-sm font-bold text-[var(--accent-blue)]">{selectedNode.latency}ms</span>
                          </div>
                      )}
                  </div>
                  
                  {selectedNode.data && (
                     <div className="mt-2">
                        <div className="text-xs font-bold text-[var(--accent-cyan)]/70 mb-2 flex items-center gap-2"><Code size={14} /> Payload Data</div>
                        <div dangerouslySetInnerHTML={{ __html: colorizeJSON({ ...selectedNode.data, details: undefined }, isDark) }} />
                     </div>
                  )}
                  
                  {selectedNode.data?.details && Array.isArray(selectedNode.data.details) && (
                     <div className="mt-6 flex flex-col gap-3">
                       <div className="text-xs text-[var(--accent-cyan)] font-bold mb-1 border-b border-white/10 pb-2 flex items-center gap-2"><Terminal size={14}/> Execution Details</div>
                       {selectedNode.data.details.map((detail: any, i: number) => (
                         <details key={i} className={`group/detail border overflow-hidden shadow-inner rounded-lg ${isDark ? 'border-white/10 bg-[#1a1b26]' : 'border-black/10 bg-white'}`}>
                           <summary className={`p-3 text-xs cursor-pointer select-none font-medium transition-colors flex items-center justify-between ${isDark ? 'text-white bg-black/40 hover:bg-white/10' : 'text-gray-800 bg-gray-100 hover:bg-gray-200'}`}>
                             <span className="font-bold tracking-wide">{detail.title || `Item ${i + 1}`}</span>
                             <ChevronDown size={14} className="text-gray-500 group-open/detail:rotate-180 transition-transform" />
                           </summary>
                           <div className={`p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto scrollbar-thin border-t ${isDark ? 'text-gray-300 scrollbar-thumb-white/20 border-white/5 bg-[#0a0a0f]' : 'text-gray-700 scrollbar-thumb-black/20 border-black/5 bg-gray-50'}`}>
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

function FlowNode({ node, onClick, isSelected }: { node: TraceNode, onClick: () => void, isSelected: boolean }) {
  const { theme } = useAppStore();
  const isDark = theme === 'dark';
  const isRunning = node.status === 'running';
  const isError = node.status === 'error';
  const isSuccess = node.status === 'success';

  let borderGlow = isDark ? 'border-white/10 text-gray-400 shadow-none' : 'border-black/10 text-gray-600 shadow-none';
  let innerBg = isDark ? 'bg-[#12121a]' : 'bg-white';

  if (isRunning) {
    borderGlow = 'border-[var(--accent-purple)] text-[var(--accent-purple)] shadow-[0_0_30px_rgba(179,0,255,0.4)] animate-pulse';
    innerBg = isDark ? 'bg-[#1e1033]' : 'bg-purple-50';
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
      id={node.id}
      initial={{ scale: 0.8, opacity: 0, y: -20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      onClick={onClick}
      className={`relative z-10 cursor-pointer transform transition-transform hover:scale-110 ${isSelected ? 'scale-105' : ''}`}
    >
      {isSelected && (
          <div className="absolute -inset-1.5 bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-cyan)] rounded-2xl blur opacity-50 z-0 animate-pulse"></div>
      )}
      <div className={`
        relative flex items-center justify-center gap-4 px-6 py-4 rounded-xl border-2 min-w-[240px] max-w-[300px]
        backdrop-blur-xl overflow-hidden transition-all duration-500 hover:shadow-[0_0_25px_rgba(0,242,254,0.4)]
        ${borderGlow} ${innerBg} ${isSelected ? 'border-[var(--accent-cyan)] shadow-[0_0_30px_rgba(0,242,254,0.3)]' : ''}
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
          <div className="absolute -right-2 -top-2 bg-black border border-[var(--accent-cyan)]/50 text-[10px] text-[var(--accent-cyan)] font-mono px-2 py-0.5 rounded-full z-20 shadow-[0_0_10px_rgba(0,242,254,0.3)]">
            {node.latency}ms
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LogCard({ event }: { event: TraceEvent }) {
  const { theme } = useAppStore();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const isTool = event.type === 'tool_start' || event.type === 'tool_end';
  const isError = event.type === 'tool_error';
  
  let icon = <Terminal size={18} className="text-gray-400" />;
  if (isTool) icon = <Wrench size={18} className="text-[var(--accent-blue)]" />;
  if (isError) icon = <AlertTriangle size={18} className="text-red-500" />;
  if (event.type === 'llm_start' || event.type === 'agent_start') icon = <Brain size={18} className="text-[var(--accent-purple)]" />;
  if (event.type === 'session_info') icon = <Database size={18} className="text-[var(--accent-cyan)]" />;
  if (event.type === 'run_summary') icon = <Clock size={18} className="text-amber-400" />;

  const title = event.type === 'run_summary'
    ? 'RUN SUMMARY'
    : event.type.replace('_', ' ').toUpperCase();
  const time = new Date(event.timestamp || Date.now()).toLocaleTimeString();

  return (
    <div className={`group ${isDark ? 'bg-[#151521]' : 'bg-white'} border ${event.type === 'session_info' ? 'border-[var(--accent-cyan)]/30 shadow-[0_0_15px_rgba(0,242,254,0.1)]' : (isDark ? 'border-white/5' : 'border-black/5')} rounded-xl overflow-hidden hover:border-[var(--accent-cyan)]/40 transition-colors shadow-lg`}>
      <div 
        className={`flex items-center gap-3 p-3.5 cursor-pointer select-none transition-colors ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={`p-1.5 rounded-lg shadow-inner border ${isDark ? 'bg-black/40 border-white/5' : 'bg-gray-100 border-black/5'}`}>
          {icon}
        </div>
        <span className={`font-mono font-bold text-sm tracking-wider ${isDark ? 'text-white/90' : 'text-gray-900'}`}>{title}</span>
        
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
            <div className={`p-4 relative border-t ${isDark ? 'bg-black/80 border-white/5' : 'bg-gray-50 border-black/5'}`}>
               <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/30 to-transparent"></div>
               <div dangerouslySetInnerHTML={{ __html: colorizeJSON({ ...event.data, details: undefined }, isDark) }} />
               {event.data.details && Array.isArray(event.data.details) && (
                 <div className="mt-4 flex flex-col gap-2">
                   <div className="text-xs text-[var(--accent-cyan)] font-bold mb-1 border-b border-white/10 pb-1">详细内容 (Details)</div>
                   {event.data.details.map((detail: any, i: number) => (
                     <details key={i} className={`group/detail border overflow-hidden shadow-inner rounded-lg ${isDark ? 'border-white/10 bg-[#1a1b26]' : 'border-black/10 bg-white'}`}>
                       <summary className={`p-2.5 text-xs cursor-pointer select-none font-medium transition-colors flex items-center justify-between ${isDark ? 'text-white bg-black/40 hover:bg-white/10' : 'text-gray-800 bg-gray-100 hover:bg-gray-200'}`}>
                         <span>{detail.title || `Item ${i + 1}`}</span>
                         <span className="text-gray-500 text-[10px] opacity-0 group-hover/detail:opacity-100 transition-opacity">展开/折叠</span>
                       </summary>
                       <div className={`p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin border-t ${isDark ? 'text-gray-300 scrollbar-thumb-white/20 border-white/5 bg-[#0a0a0f]' : 'text-gray-700 scrollbar-thumb-black/20 border-black/5 bg-gray-50'}`}>
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
