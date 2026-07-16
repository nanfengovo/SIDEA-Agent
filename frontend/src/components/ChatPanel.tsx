import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader, User, Cpu, Paperclip, Copy, MessageSquareReply, X, FileText, Image as ImageIcon, Check, Languages, Brain, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TraceEvent } from '../types';

interface ChatPanelProps {
  onEvent: (event: TraceEvent) => void;
  onClear: () => void;
  skillId: string;
  sessionId: string;
}

interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  attachments?: Attachment[];
  translation?: string;
  isTranslating?: boolean;
  targetLang?: string;
}

export default function ChatPanel({ onEvent, onClear, skillId, sessionId }: ChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'agent', content: t('welcome_msg') || '您好！欢迎使用 SIDEA 智能体。' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState('简体中文');
  const [thinkingDepth, setThinkingDepth] = useState('auto');
  const [contextLength, setContextLength] = useState('8k');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages(prev => {
      const msgs = [...prev];
      if (msgs.length > 0 && msgs[0].id === 'welcome') {
        msgs[0].content = t('welcome_msg') || '您好！欢迎使用 SIDEA 智能体。';
      }
      return msgs;
    });
  }, [t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, attachments, replyTo]);

  useEffect(() => {
    // Fetch messages for the current session
    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/history/sessions/${sessionId}/messages`);
        if (res.ok) {
          const historyMsgs = await res.json();
          if (historyMsgs.length > 0) {
            setMessages(historyMsgs.map((m: any) => ({
              id: m.message_id,
              role: m.role,
              content: m.content
            })));
          } else {
            setMessages([{ id: 'welcome', role: 'agent', content: t('welcome_msg') || '您好！欢迎使用 SIDEA 智能体。' }]);
          }
        }
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };
    fetchHistory();
  }, [sessionId, t]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTranslate = async (id: string, text: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isTranslating: true, translation: '', targetLang } : m));
    
    try {
      const res = await fetch('/api/chat/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target_lang: targetLang })
      });
      
      if (!res.ok) throw new Error('Translation failed');
      const reader = res.body?.getReader();
      if (!reader) return;
      
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n\\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.token) {
                setMessages(prev => prev.map(m => 
                  m.id === id ? { ...m, translation: (m.translation || '') + data.token } : m
                ));
              } else if (data.error) {
                setMessages(prev => prev.map(m => 
                  m.id === id ? { ...m, translation: (m.translation || '') + '\\n[翻译失败: ' + data.error + ']' } : m
                ));
              }
            } catch(e) {}
          }
        }
      }
    } catch(err) {
      console.error(err);
    } finally {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isTranslating: false } : m));
    }
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          name: data.filename,
          url: `http://localhost:8000${data.url}`,
          type: data.content_type
        }]);
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(uploadFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let hasFiles = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            uploadFile(file);
            hasFiles = true;
          }
        }
      }
    }
    if (hasFiles) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(uploadFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isTyping) return;

    let userMsg = input.trim();
    if (replyTo) {
      userMsg = `> **引用 ${replyTo.role === 'agent' ? '智能体' : '用户'}**: ${replyTo.content.substring(0, 50).replace(/\n/g, ' ')}...\n\n${userMsg}`;
    }

    const currentAttachments = [...attachments];
    
    setInput('');
    setAttachments([]);
    setReplyTo(null);
    setMessages(prev => [...prev, { 
      id: Date.now().toString(), 
      role: 'user', 
      content: userMsg || '[发送了附件]',
      attachments: currentAttachments 
    }]);
    setIsTyping(true);
    onClear();

    try {
      const res = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg, 
          skill_id: skillId,
          thread_id: sessionId,
          attachments: currentAttachments.map(a => a.url),
          thinking_depth: thinkingDepth,
          context_length: contextLength
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let agentMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: agentMsgId, role: 'agent', content: '' }]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (dataStr === 'null' || dataStr === '') continue;
            
            try {
              const event: TraceEvent = JSON.parse(dataStr);
              event.timestamp = Date.now();
              if (event.type !== 'llm_token') {
                onEvent(event);
              }
              
              if (event.type === 'llm_token' && event.data.token) {
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId ? { ...m, content: m.content + event.data.token } : m
                ));
              } else if (event.type === 'llm_final' && event.data.content) {
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId && !m.content ? { ...m, content: event.data.content } : m
                ));
              } else if (event.type === 'error') {
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId ? { ...m, content: m.content + `\n\n**系统异常:** ${event.data.message}` } : m
                ));
              }
            } catch (err) {
              console.error("Parse event error:", err);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: `执行失败：${err.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div 
      className="flex flex-col h-full overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[var(--accent-cyan)] rounded-full blur-[120px] opacity-[0.03] pointer-events-none z-0"></div>
      
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-panel)]/80 backdrop-blur-sm border-2 border-dashed border-[var(--accent-cyan)] rounded-xl flex items-center justify-center">
          <div className="text-center text-[var(--accent-cyan)]">
            <Paperclip className="w-12 h-12 mx-auto mb-2 animate-bounce" />
            <p className="font-bold text-lg">松开以上传文件或图片</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 space-y-6 z-10" ref={scrollRef}>
        <AnimatePresence>
          {messages.map((m) => (
            <motion.div 
              key={m.id} 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className={`flex gap-4 w-full group ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'agent' && (
                <div className="w-10 h-10 rounded-full bg-[var(--accent-cyan)]/10 flex items-center justify-center border border-[var(--accent-cyan)]/40 shadow-[0_0_15px_rgba(0,242,254,0.2)] flex-shrink-0 mt-1 relative overflow-hidden flex-col">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-cyan)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <Cpu size={20} className="text-[var(--accent-cyan)]" />
                </div>
              )}
              
              <div className={`flex flex-col max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`rounded-2xl px-5 py-3.5 shadow-lg backdrop-blur-md relative ${
                  m.role === 'user' 
                    ? 'message-bubble-user rounded-tr-none text-right'
                    : 'message-bubble-agent rounded-tl-none prose prose-invert max-w-none'
                }`}>
                  {m.role === 'user' ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-[var(--text-primary)] font-medium leading-relaxed tracking-wide whitespace-pre-wrap">{m.content}</div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2 justify-end">
                          {m.attachments.map(att => (
                            <div key={att.id} className="relative group/att rounded-lg overflow-hidden border border-white/10 bg-black/30">
                              {att.type.startsWith('image') ? (
                                <img src={att.url} alt={att.name} className="h-24 w-auto object-cover opacity-90 hover:opacity-100 transition-opacity" />
                              ) : (
                                <div className="h-16 px-4 flex items-center justify-center gap-2">
                                  <FileText size={16} className="text-[var(--accent-blue)]" />
                                  <span className="text-xs text-[var(--text-secondary)] truncate max-w-[150px]">{att.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[var(--text-primary)]/90 leading-relaxed tracking-wide w-full overflow-hidden">
                      {m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : <span className="animate-pulse opacity-50">▌</span>}
                    </div>
                  )}
                  {m.translation !== undefined && (
                    <div className="mt-3 pt-3 border-t border-white/10 relative">
                      <div className="text-xs text-[var(--accent-purple)] mb-2 flex items-center gap-1">
                        <Languages size={12} /> 翻译结果 ({m.targetLang || '中文'})
                      </div>
                      <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1a1b26] prose-pre:border prose-pre:border-white/10 max-w-none text-[0.95rem]">
                        <ReactMarkdown>{m.translation}</ReactMarkdown>
                      </div>
                      {m.isTranslating && <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse align-middle" />}
                    </div>
                  )}
                </div>
                
                {/* Action Bar */}
                <div className={`flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {m.role === 'agent' && (
                    <div className="flex items-center bg-black/20 rounded-md border border-white/5 overflow-hidden">
                      <select
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="bg-transparent text-gray-400 text-xs outline-none cursor-pointer hover:text-[var(--accent-cyan)] pl-2 pr-1 appearance-none"
                      >
                        <option value="简体中文" className="bg-[#1a1b26]">简中</option>
                        <option value="繁體中文" className="bg-[#1a1b26]">繁中</option>
                        <option value="English" className="bg-[#1a1b26]">EN</option>
                        <option value="日本語" className="bg-[#1a1b26]">日文</option>
                      </select>
                      <button 
                        onClick={() => handleTranslate(m.id, m.content)}
                        className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"
                        title={`翻译为 ${targetLang}`}
                        disabled={m.isTranslating}
                      >
                        <Languages size={14} className={m.isTranslating ? "animate-pulse" : ""} />
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => handleCopy(m.id, m.content)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"
                    title="复制内容"
                  >
                    {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <button 
                    onClick={() => setReplyTo(m)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"
                    title="引用回复"
                  >
                    <MessageSquareReply size={14} />
                  </button>
                </div>
              </div>

              {m.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center border border-[var(--accent-blue)]/40 shadow-[0_0_15px_rgba(79,172,254,0.2)] flex-shrink-0 mt-1">
                  <User size={20} className="text-[var(--accent-blue)]" />
                </div>
              )}
            </motion.div>
          ))}
          
          {isTyping && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }} 
               animate={{ opacity: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.9 }}
               className="flex gap-4 justify-start w-full"
             >
               <div className="w-10 h-10 rounded-full bg-[var(--accent-cyan)]/10 flex items-center justify-center border border-[var(--accent-cyan)]/40 animate-border-glow shadow-[0_0_15px_rgba(0,242,254,0.2)]">
                  <Loader size={20} className="text-[var(--accent-cyan)] animate-spin" />
               </div>
               <div className="message-bubble-agent rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-2 shadow-lg backdrop-blur-md h-[48px]">
                 <span className="w-2 h-2 bg-[var(--accent-cyan)] rounded-full animate-ping"></span>
                 <span className="w-2 h-2 bg-[var(--accent-blue)] rounded-full animate-ping" style={{animationDelay: '0.2s'}}></span>
                 <span className="w-2 h-2 bg-[var(--accent-purple)] rounded-full animate-ping" style={{animationDelay: '0.4s'}}></span>
               </div>
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-2 pt-4 border-t border-[var(--border-color)]/50 relative z-10 flex flex-col gap-2">
        {/* Reply Bar */}
        <AnimatePresence>
          {replyTo && (
            <motion.div 
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex items-center justify-between bg-black/20 border border-[var(--accent-cyan)]/30 rounded-lg px-4 py-2"
            >
              <div className="text-sm text-[var(--text-secondary)] truncate flex-1">
                <span className="text-[var(--accent-cyan)] mr-2">回复 {replyTo.role === 'agent' ? '智能体' : '用户'}:</span>
                {replyTo.content}
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white ml-2">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachments Bar */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex gap-2 flex-wrap"
            >
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-full px-3 py-1 text-xs text-[var(--text-secondary)] group">
                  {att.type.startsWith('image') ? <ImageIcon size={12} className="text-[var(--accent-cyan)]" /> : <FileText size={12} className="text-[var(--accent-blue)]" />}
                  <span className="max-w-[100px] truncate">{att.name}</span>
                  <button type="button" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="text-gray-400 hover:text-red-400">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <input 
            type="file" 
            multiple 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-[60px] w-[50px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-colors flex-shrink-0"
            title="上传文件或图片 (支持拖拽和粘贴)"
          >
            <Paperclip size={24} />
          </button>
          
          <div className="flex-1 relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-blue)] rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              onPaste={handlePaste}
              disabled={isTyping}
              placeholder={t('chat_placeholder') || "输入指令或粘贴图片 (Ctrl+V)..."}
              className="relative w-full bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl pl-5 pr-48 py-4 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors placeholder-[var(--text-secondary)] resize-none min-h-[60px] max-h-[150px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ WebkitAppearance: 'none' }}
              rows={1}
            />
            {/* Model Settings Overlays */}
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <div className="flex items-center bg-black/40 border border-[var(--accent-cyan)]/30 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/60 transition-colors cursor-pointer" title="思考深度 / 策略">
                <Brain size={12} className="mr-1" />
                <select value={thinkingDepth} onChange={(e) => setThinkingDepth(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center">
                  <option value="auto" className="bg-[#1a1b26]">深度: 自动</option>
                  <option value="deep" className="bg-[#1a1b26]">深度: 深度推理</option>
                  <option value="fast" className="bg-[#1a1b26]">深度: 快速响应</option>
                </select>
              </div>
              <div className="flex items-center bg-black/40 border border-[var(--accent-purple)]/30 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-purple)] hover:border-[var(--accent-purple)]/60 transition-colors cursor-pointer" title="上下文长度">
                <Database size={12} className="mr-1" />
                <select value={contextLength} onChange={(e) => setContextLength(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center">
                  <option value="8k" className="bg-[#1a1b26]">上下文: 8K</option>
                  <option value="32k" className="bg-[#1a1b26]">上下文: 32K</option>
                  <option value="128k" className="bg-[#1a1b26]">上下文: 128K</option>
                </select>
              </div>
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={isTyping || (!input.trim() && attachments.length === 0)}
            className="relative h-[60px] w-[60px] bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-blue)] text-white font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,242,254,0.6)] disabled:opacity-50 disabled:hover:shadow-none transition-all flex items-center justify-center flex-shrink-0 group overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            {isTyping ? <Loader className="animate-spin text-white w-6 h-6" /> : <Send className="text-white w-6 h-6 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>
      </div>
    </div>
  );
}
