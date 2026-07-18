import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader, User, Cpu, Paperclip, Copy, MessageSquareReply, X, FileText, Image as ImageIcon, Check, Languages, Brain, Database, Download, FileDown, ImageDown, BookOpen } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { getApiUrl, getBaseUrl } from '../config';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Tooltip, message, notification, Image } from 'antd';
import type { TraceEvent } from '../types';

interface ChatPanelProps {
  onEvent: (event: TraceEvent) => void;
  onClear: () => void;
  onLoadTrace: (events: TraceEvent[]) => void;
  skillId: string;
  sessionId: string;
  permissionMode?: string;
  onPermissionModeChange?: (mode: string) => void;
  onMessageSent?: () => void;
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
  trace_events?: TraceEvent[];
}

export default function ChatPanel({ onEvent, onClear, onLoadTrace, skillId, sessionId, permissionMode = 'ask_always', onPermissionModeChange, onMessageSent }: ChatPanelProps) {
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
  const [approvalData, setApprovalData] = useState<{ id: string, toolName: string, toolInput: any, reason: string } | null>(null);
  const [thinkingDepth, setThinkingDepth] = useState('auto');
  const [contextLength, setContextLength] = useState('8k');
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  
  const [messageQueue, setMessageQueue] = useState<{text: string, attachments: Attachment[]}[]>([]);
  const [interruptPrompt, setInterruptPrompt] = useState<{text: string, attachments: Attachment[]} | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUserScrolledUp = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // If we are more than 100px from the bottom, user has intentionally scrolled up
      isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 100;
    }
  };

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
    if (scrollRef.current && !isUserScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, attachments, replyTo]);

  useEffect(() => {
    // Fetch messages for the current session
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/history/sessions/${sessionId}/messages`);
        if (res.ok) {
          const historyMsgs = await res.json();
          if (historyMsgs.length > 0) {
            setMessages(historyMsgs.map((m: any) => ({
              id: m.message_id,
              role: m.role,
              content: m.content,
              trace_events: m.trace_events ? JSON.parse(m.trace_events) : undefined
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
      const res = await fetch(`${getApiUrl()}/chat/translate`, {
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
        const lines = buffer.split('\n\n');
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
                  m.id === id ? { ...m, translation: (m.translation || '') + '\n[翻译失败: ' + data.error + ']' } : m
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

  const handleExportMarkdown = (m: Message) => {
    try {
      const blob = new Blob([m.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SIDEA_Message_${new Date().getTime()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('Markdown 导出成功');
    } catch (e) {
      message.error('Markdown 导出失败');
    }
  };

  const handleExportImage = async (m: Message) => {
    const el = document.getElementById(`msg-${m.id}`);
    if (!el) {
      message.error('找不到要导出的消息内容');
      return;
    }
    const hideLoading = message.loading('正在生成高清长图...', 0);
    try {
      const dataUrl = await toPng(el, { 
        backgroundColor: '#1a1b26',
        pixelRatio: 5, 
      });
      
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `SIDEA_Message_${new Date().getTime()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      hideLoading();
      message.success('长图导出成功');
    } catch (e) {
      hideLoading();
      console.error('Failed to export image', e);
      message.error('长图导出失败');
    }
  };

  const handleExportPDF = async (m: Message) => {
    const el = document.getElementById(`msg-${m.id}`);
    if (!el) {
      message.error('找不到要导出的消息内容');
      return;
    }
    const hideLoading = message.loading('正在生成 PDF 文档...', 0);
    try {
      const dataUrl = await toPng(el, { 
        backgroundColor: '#1a1b26',
        pixelRatio: 5,
      });

      const width = el.offsetWidth * 5;
      const height = el.offsetHeight * 5;
      
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height]
      });
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
      pdf.save(`SIDEA_Report_${new Date().getTime()}.pdf`);
      
      hideLoading();
      message.success('PDF 导出成功');
    } catch (e) {
      hideLoading();
      console.error('Failed to export PDF', e);
      message.error('PDF 导出失败');
    }
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${getApiUrl()}/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          name: data.filename,
          url: `${getBaseUrl()}${data.url}`,
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

  const handleSubmit = async (e?: React.FormEvent, queuedTask?: {text: string, attachments: Attachment[]}, isInjection?: boolean) => {
    if (e) e.preventDefault();
    const textToSubmit = queuedTask ? queuedTask.text : input;
    const currentAttachments = queuedTask ? queuedTask.attachments : [...attachments];
    
    if ((!textToSubmit.trim() && currentAttachments.length === 0)) return;

    if (isTyping && !queuedTask && !isInjection) {
      if (textToSubmit.trim() || currentAttachments.length > 0) {
        setInterruptPrompt({ text: textToSubmit, attachments: currentAttachments });
      }
      return;
    }

    let userMsg = textToSubmit.trim();
    if (replyTo) {
      userMsg = `> **引用 ${replyTo.role === 'agent' ? '智能体' : '用户'}**: ${replyTo.content.substring(0, 50).replace(/\n/g, ' ')}...\n\n${userMsg}`;
    }

    if (!queuedTask && !isInjection) {
      setInput('');
      setAttachments([]);
    }
    setReplyTo(null);

    let finalPayloadMsg = userMsg;
    let finalPayloadAttachments = currentAttachments;

    if (isInjection) {
      const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
         finalPayloadMsg = lastUserMsg.content + `\n\n**[补充提示]**: ${textToSubmit}`;
         finalPayloadAttachments = [...(lastUserMsg.attachments || []), ...currentAttachments];
      }
      setMessages(prev => {
         const newMsgs = [...prev];
         if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'agent') {
            newMsgs.pop();
         }
         for (let i = newMsgs.length - 1; i >= 0; i--) {
            if (newMsgs[i].role === 'user') {
               newMsgs[i].content = finalPayloadMsg;
               newMsgs[i].attachments = finalPayloadAttachments;
               break;
            }
         }
         return newMsgs;
      });
    } else {
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        content: userMsg || '[发送了附件]',
        attachments: currentAttachments 
      }]);
    }

    setIsTyping(true);
    onClear();
    
    // Force immediate scroll to bottom when sending a new message ONLY if the user hasn't explicitly scrolled up
    setTimeout(() => {
      if (scrollRef.current && !isUserScrolledUp.current) {
         scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 10);

    try {
      abortControllerRef.current = new AbortController();
      const res = await fetch(`${getApiUrl()}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({ 
          message: finalPayloadMsg, 
          skill_id: skillId,
          thread_id: sessionId,
          attachments: finalPayloadAttachments.map(a => a.url),
          thinking_depth: thinkingDepth,
          context_length: contextLength,
          use_knowledge_base: useKnowledgeBase,
          permission_mode: permissionMode
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

      let hasStartedStreaming = false;
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
                
                if (event.type === 'tool_error') {
                  notification.error({
                    message: `工具执行异常: ${event.data.name || '未知工具'}`,
                    description: (
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-red-400">{event.data.message}</span>
                        <span className="text-xs font-mono text-gray-300">{event.data.error}</span>
                      </div>
                    ),
                    duration: 10,
                    className: 'custom-dark-notification'
                  });
                } else if (event.type === 'approval_request') {
                  setApprovalData({
                    id: event.data.approval_id,
                    toolName: event.data.tool_name,
                    toolInput: event.data.tool_input,
                    reason: event.data.reason
                  });
                }
              }
              
              if (event.type === 'llm_token' && event.data.token) {
                if (!hasStartedStreaming) {
                  onEvent({ id: 'stream_start', type: 'stream_start', timestamp: Date.now(), data: {} });
                  hasStartedStreaming = true;
                }
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
      onEvent({ id: 'stream_end', type: 'stream_end', timestamp: Date.now(), data: {} });
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
         setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: `\n\n*[用户已手动终止执行]*` }]);
      } else {
         console.error(err);
         setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: `执行失败：${err.message}` }]);
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isTyping && messageQueue.length > 0) {
      const nextTask = messageQueue[0];
      setMessageQueue(prev => prev.slice(1));
      handleSubmit(undefined, nextTask);
    }
  }, [isTyping, messageQueue]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!approvalData) return;
    try {
      await fetch(`${getApiUrl()}/chat/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_id: approvalData.id,
          approved: approved
        })
      });
      setApprovalData(null);
    } catch (err) {
      console.error("Approval error", err);
      message.error("审批提交失败！");
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

      <div className="flex-1 overflow-y-auto pr-2 space-y-6 z-10" ref={scrollRef} onScroll={handleScroll}>
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
                <div 
                  id={`msg-${m.id}`} 
                  onClick={() => {
                    if (m.role === 'agent' && m.trace_events && !isTyping) {
                       onLoadTrace(m.trace_events);
                       message.success('已加载该消息的执行链路追踪');
                    }
                  }}
                  className={`rounded-2xl px-5 py-3.5 shadow-lg backdrop-blur-md relative ${
                  m.role === 'user' 
                    ? 'message-bubble-user rounded-tr-none text-right'
                    : 'message-bubble-agent rounded-tl-none prose prose-invert max-w-none hover:ring-2 ring-[var(--accent-cyan)]/30 cursor-pointer transition-all'
                }`}>
                  {m.role === 'user' ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-[var(--text-primary)] font-medium leading-relaxed tracking-wide whitespace-pre-wrap">{m.content}</div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2 justify-end">
                          {m.attachments.map(att => (
                            <div key={att.id} className="relative group/att rounded-lg overflow-hidden border border-white/10 bg-black/30">
                              {att.type.startsWith('image') ? (
                                <Image src={att.url} alt={att.name} height={96} preview={{ mask: <span className="text-xs text-white">点击预览</span> }} className="object-cover opacity-90 hover:opacity-100 transition-opacity" />
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
                      {m.content ? <MarkdownRenderer content={m.content} isTyping={isTyping && m.id === messages[messages.length - 1].id} /> : <span className="animate-pulse opacity-50">▌</span>}
                    </div>
                  )}
                  {m.translation !== undefined && (
                    <div className="mt-3 pt-3 border-t border-white/10 relative">
                      <div className="text-xs text-[var(--accent-purple)] mb-2 flex items-center gap-1">
                        <Languages size={12} /> 翻译结果 ({m.targetLang || '中文'})
                      </div>
                      <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1a1b26] prose-pre:border prose-pre:border-white/10 max-w-none text-[0.95rem]">
                        <MarkdownRenderer content={m.translation} />
                      </div>
                      {m.isTranslating && <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse align-middle" />}
                    </div>
                  )}
                </div>
                
                {/* Action Bar */}
                <div className={`flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {m.role === 'agent' && (
                    <div className="flex items-center bg-black/20 rounded-md border border-white/5 overflow-hidden mr-1">
                      <Tooltip title="导出为 PDF" placement="bottom"><button onClick={() => handleExportPDF(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><Download size={14} /></button></Tooltip>
                      <Tooltip title="导出为 PNG" placement="bottom"><button onClick={() => handleExportImage(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><ImageDown size={14} /></button></Tooltip>
                      <Tooltip title="导出为 Markdown" placement="bottom"><button onClick={() => handleExportMarkdown(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><FileDown size={14} /></button></Tooltip>
                    </div>
                  )}
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
                          onClick={() => {
                            if (m.role === 'agent') {
                              const prevIndex = messages.findIndex(msg => msg.id === m.id) - 1;
                              const userMsg = prevIndex >= 0 ? messages[prevIndex] : null;
                              const content = userMsg ? `用户提问: ${userMsg.content}\nAI回答: ${m.content}` : m.content;
                              fetch(`${getApiUrl()}/knowledge/extract`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ session_id: sessionId, message: content })
                              }).then(() => console.log("已发送至经验提炼队列"));
                            }
                          }}
                          className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-purple)] transition-colors"
                          title="✨ 沉淀为经验规则"
                        >
                          <BookOpen size={14} />
                      </button>
                      <Tooltip title={`翻译为 ${targetLang}`} placement="bottom">
                        <button 
                          onClick={() => handleTranslate(m.id, m.content)}
                          className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"
                          disabled={m.isTranslating}
                        >
                          <Languages size={14} className={m.isTranslating ? "animate-pulse" : ""} />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                  <Tooltip title="复制内容" placement="bottom">
                    <button 
                      onClick={() => handleCopy(m.id, m.content)}
                      className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors bg-black/20 border border-white/5"
                    >
                      {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </Tooltip>
                  <Tooltip title="引用回复" placement="bottom">
                    <button 
                      onClick={() => setReplyTo(m)}
                      className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors bg-black/20 border border-white/5"
                    >
                      <MessageSquareReply size={14} />
                    </button>
                  </Tooltip>
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
        {/* Message Queue Indicator */}
        <AnimatePresence>
          {messageQueue.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex items-center justify-between bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 rounded-lg px-4 py-2"
            >
              <div className="text-sm text-[var(--text-primary)] truncate flex-1 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-purple)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-purple)]"></span>
                </span>
                队列中有 {messageQueue.length} 个任务等待执行...
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

        <form onSubmit={handleSubmit} className="flex gap-3 items-end relative">
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
            
            {isTyping && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
                <button 
                  type="button" 
                  onClick={handleStop}
                  className="flex items-center gap-2 bg-[#1a1b26] border border-red-500/50 text-red-500 hover:bg-red-500/20 px-4 py-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all text-xs font-bold"
                >
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div> 停止生成
                </button>
              </div>
            )}

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
              placeholder={t('chat_placeholder') || "输入指令或粘贴图片 (Ctrl+V)..."}
              className="relative w-full bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl pl-5 pr-5 pt-4 pb-12 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors placeholder-[var(--text-secondary)] resize-none min-h-[60px] max-h-[150px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ WebkitAppearance: 'none' }}
              rows={1}
            />
            {/* Model Settings Overlays */}
            <div className="absolute left-3 bottom-2.5 flex items-center gap-2">
              <div className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                thinkingDepth === 'deep' ? 'text-[var(--accent-purple)] border-[var(--accent-purple)]/50 bg-[var(--accent-purple)]/10' :
                thinkingDepth === 'fast' ? 'text-green-400 border-green-400/50 bg-green-400/10' :
                'text-[var(--text-secondary)] border-[var(--accent-cyan)]/30 bg-black/40 hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/60'
              }`} title="思考深度 / 策略">
                <Brain size={12} className="mr-1" />
                <select value={thinkingDepth} onChange={(e) => setThinkingDepth(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center font-medium">
                  <option value="auto" className="bg-[#1a1b26] text-gray-300">深度: 自动</option>
                  <option value="deep" className="bg-[#1a1b26] text-[var(--accent-purple)]">深度: 深度推理</option>
                  <option value="fast" className="bg-[#1a1b26] text-green-400">深度: 快速响应</option>
                </select>
              </div>
              <div className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                contextLength === '128k' ? 'text-red-400 border-red-400/50 bg-red-400/10' :
                contextLength === '32k' ? 'text-orange-400 border-orange-400/50 bg-orange-400/10' :
                'text-[var(--text-secondary)] border-[var(--accent-purple)]/30 bg-black/40 hover:text-[var(--accent-purple)] hover:border-[var(--accent-purple)]/60'
              }`} title="上下文长度">
                <Database size={12} className="mr-1" />
                <select value={contextLength} onChange={(e) => setContextLength(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center font-medium">
                  <option value="8k" className="bg-[#1a1b26] text-gray-300">上下文: 8K</option>
                  <option value="32k" className="bg-[#1a1b26] text-orange-400">上下文: 32K</option>
                  <option value="128k" className="bg-[#1a1b26] text-red-400">上下文: 128K</option>
                </select>
              </div>
              <div 
                onClick={() => setUseKnowledgeBase(!useKnowledgeBase)}
                className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  useKnowledgeBase ? 'text-[var(--accent-blue)] border-[var(--accent-blue)]/50 bg-[var(--accent-blue)]/10 shadow-[0_0_10px_rgba(79,172,254,0.2)]' :
                  'text-[var(--text-secondary)] border-[var(--accent-cyan)]/30 bg-black/40 hover:text-[var(--accent-blue)] hover:border-[var(--accent-blue)]/60'
                }`} 
                title="本地增强知识库 (RAG)"
              >
                <BookOpen size={12} className="mr-1" />
                <span className="font-medium bg-transparent outline-none cursor-pointer">
                  知识库: {useKnowledgeBase ? '开启' : '关闭'}
                </span>
              </div>
              {onPermissionModeChange && (
                <div className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  permissionMode === 'ask_always' ? 'text-red-400 border-red-400/50 bg-red-400/10' :
                  permissionMode === 'ask_risky' ? 'text-orange-400 border-orange-400/50 bg-orange-400/10' :
                  'text-green-400 border-green-400/50 bg-green-400/10'
                }`} title="权限控制 (HITL)">
                  <select 
                    value={permissionMode} 
                    onChange={(e) => onPermissionModeChange(e.target.value)} 
                    className="bg-transparent outline-none cursor-pointer appearance-none text-center font-medium"
                  >
                    <option value="ask_always" className="bg-[#1a1b26] text-red-400">权限: 请求批准</option>
                    <option value="ask_risky" className="bg-[#1a1b26] text-orange-400">权限: 替我审批</option>
                    <option value="full_access" className="bg-[#1a1b26] text-green-400">权限: 完全访问</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={(!input.trim() && attachments.length === 0)}
            className="relative h-[60px] w-[60px] bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-blue)] text-white font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,242,254,0.6)] disabled:opacity-50 disabled:hover:shadow-none transition-all flex items-center justify-center flex-shrink-0 group overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            <Send className="text-white w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        {/* Interrupt Prompt Modal */}
        <AnimatePresence>
          {interruptPrompt && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#12121a] border border-[var(--accent-cyan)]/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(0,242,254,0.15)] max-w-sm w-full"
              >
                <div className="flex items-center gap-3 mb-4 text-[var(--accent-cyan)]">
                  <Brain size={24} />
                  <h3 className="text-lg font-bold tracking-wider">AI 正在输出中</h3>
                </div>
                <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">
                  上一个对话尚未结束。您希望如何处理这条新指令？
                </p>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      handleStop();
                      const task = interruptPrompt;
                      setInterruptPrompt(null);
                      setTimeout(() => handleSubmit(undefined, task, true), 100);
                    }}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/50 text-[var(--accent-purple)] font-bold hover:bg-[var(--accent-purple)]/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all text-sm"
                  >
                    注入到上一条指令并重新生成
                  </button>
                  <button 
                    onClick={() => {
                      setMessageQueue(prev => [...prev, interruptPrompt]);
                      setInterruptPrompt(null);
                      setInput('');
                      setAttachments([]);
                    }}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/50 text-[var(--accent-cyan)] font-bold hover:bg-[var(--accent-cyan)]/20 hover:shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all text-sm"
                  >
                    加入排队队列 (稍后自动执行)
                  </button>
                  <button 
                    onClick={() => setInterruptPrompt(null)}
                    className="w-full py-2 mt-2 rounded-lg text-[var(--text-secondary)] hover:text-white transition-colors text-sm"
                  >
                    取消
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Approval Modal Overlay */}
      <AnimatePresence>
        {approvalData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[var(--bg-secondary)] border border-red-500/50 shadow-2xl shadow-red-500/20 rounded-xl w-[400px] overflow-hidden flex flex-col"
            >
              <div className="bg-red-500/10 p-4 border-b border-red-500/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <span className="text-red-500 font-bold text-xl">!</span>
                </div>
                <div>
                  <h3 className="text-red-400 font-bold m-0">安全授权拦截 (HITL)</h3>
                  <div className="text-xs text-red-400/70">{approvalData.reason}</div>
                </div>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-1">即将调用的工具：</div>
                  <div className="font-mono text-sm bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] text-[var(--text-primary)]">
                    {approvalData.toolName}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-1">工具参数：</div>
                  <div className="font-mono text-xs bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] text-[var(--text-primary)] max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                    {typeof approvalData.toolInput === 'object' ? JSON.stringify(approvalData.toolInput, null, 2) : String(approvalData.toolInput)}
                  </div>
                </div>
                <div className="text-sm text-[var(--text-secondary)] mt-2">
                  您是否允许智能体执行该操作？
                </div>
              </div>
              <div className="p-4 bg-[var(--bg-primary)] flex justify-end gap-3 border-t border-[var(--border-color)]">
                <button 
                  onClick={() => handleApproval(false)}
                  className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  拒绝 (Reject)
                </button>
                <button 
                  onClick={() => handleApproval(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-bold hover:brightness-110 transition-all shadow-[0_0_15px_rgba(0,242,254,0.3)]"
                >
                  放行 (Approve)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
