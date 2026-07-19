import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader, User, Cpu, Paperclip, Copy, MessageSquareReply, X, FileText, Image as ImageIcon, Check, Languages, Brain, Database, Download, FileDown, ImageDown, BookOpen, Layers } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import RunSummaryFooter, { EtaBanner, type RunSummary } from './RunSummaryFooter';
import ActivityTimeline, { type Activity } from './ActivityTimeline';
import { getApiUrl, getBaseUrl } from '../config';
import { toPng } from 'html-to-image';
import {
  TARGET_LANG_OPTIONS,
  protectFencedBlocks,
  convertMarkdownToTraditional,
  needsLlmTranslate,
} from './langUtils';
import type { TargetLang } from './langUtils';
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

const ToolTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);
  return <div className="text-xs font-mono text-[var(--accent-cyan)]/80 bg-[var(--accent-cyan)]/10 px-2 py-1 rounded-md">耗时: {elapsed}s</div>;
};

function deriveSummaryFromTrace(events?: TraceEvent[]): RunSummary | undefined {
  if (!Array.isArray(events) || !events.length) return undefined;
  const rs = [...events].reverse().find((e) => e?.type === 'run_summary');
  if (rs?.data) return rs.data as RunSummary;

  const tools: string[] = [];
  let start: number | undefined;
  let end: number | undefined;
  for (const e of events) {
    if (e.timestamp) {
      if (start == null || e.timestamp < start) start = e.timestamp;
      if (end == null || e.timestamp > end) end = e.timestamp;
    }
    if (e.type === 'tool_start' && e.data?.name && !tools.includes(e.data.name)) {
      tools.push(e.data.name);
    }
  }
  if (!tools.length && start == null) return undefined;
  const duration_ms = start != null && end != null ? Math.max(0, end - start) : undefined;
  return {
    tools,
    tool_count: tools.length,
    duration_ms,
    duration_sec: duration_ms != null ? Math.round(duration_ms / 10) / 100 : undefined,
  };
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  attachments?: Attachment[];
  translation?: string;
  isTranslating?: boolean;
  targetLang?: TargetLang;
  /** 消息级显示语言：立刻驱动图表/正文 i18n，不等 LLM */
  viewLang?: TargetLang;
  runSummary?: RunSummary;
  trace_events?: TraceEvent[];
  runningToolName?: string;
  toolStartTime?: number;
  /** Cursor 风执行活动时间线（思考/工具/输出） */
  activities?: Activity[];
}

let _actSeq = 0;
function newActivity(kind: Activity['kind'], name?: string): Activity {
  return {
    id: `act-${Date.now()}-${_actSeq++}`,
    kind,
    name,
    startTs: Date.now(),
    status: 'running',
  };
}

function closeRunningActs(
  acts: Activity[],
  status: 'done' | 'error' = 'done',
  detail?: string,
): Activity[] {
  return acts.map((a) =>
    a.status === 'running' ? { ...a, status, endTs: Date.now(), detail: detail ?? a.detail } : a,
  );
}

/** 历史消息：从落库的 trace_events 还原活动时间线（折叠态回看用） */
function deriveActivitiesFromTrace(events?: TraceEvent[]): Activity[] {
  if (!Array.isArray(events) || !events.length) return [];
  const acts: Activity[] = [];
  let current: Activity | null = null;
  const close = (ts: number, status: 'done' | 'error' = 'done', detail?: string) => {
    if (current) {
      current.endTs = ts;
      current.status = status;
      if (detail) current.detail = detail;
      current = null;
    }
  };
  for (const e of events) {
    const ts = e.timestamp || 0;
    if (e.type === 'llm_start') {
      close(ts);
      current = { id: `h-${acts.length}`, kind: 'thinking', startTs: ts, status: 'done' };
      acts.push(current);
    } else if (e.type === 'tool_start') {
      close(ts);
      current = { id: `h-${acts.length}`, kind: 'tool', name: e.data?.name, startTs: ts, status: 'done' };
      acts.push(current);
    } else if (e.type === 'tool_end') {
      close(ts);
    } else if (e.type === 'tool_error') {
      close(ts, 'error', e.data?.error || e.data?.message);
    } else if (e.type === 'llm_end' || e.type === 'stream_end') {
      close(ts);
    }
  }
  return acts.map((a) => ({ ...a, endTs: a.endTs ?? a.startTs }));
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
  const [targetLang, setTargetLang] = useState<TargetLang>('简体中文');
  const [langMenuFor, setLangMenuFor] = useState<string | null>(null);
  const [approvalData, setApprovalData] = useState<{ id: string, toolName: string, toolInput: any, reason: string } | null>(null);
  const [thinkingDepth, setThinkingDepth] = useState('auto');
  const [executionMode, setExecutionMode] = useState('auto'); // auto | goal | react
  const [contextLength, setContextLength] = useState('8k');
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  
  const [messageQueue, setMessageQueue] = useState<{text: string, attachments: Attachment[]}[]>([]);
  const [interruptPrompt, setInterruptPrompt] = useState<{text: string, attachments: Attachment[]} | null>(null);
  const [etaInfo, setEtaInfo] = useState<{ eta_sec: number; confidence?: string; sample_size?: number } | null>(null);
  const [taskStartedAt, setTaskStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  
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
            setMessages(historyMsgs.map((m: any) => {
              let runSummary: RunSummary | undefined;
              try {
                if (m.run_meta) runSummary = typeof m.run_meta === 'string' ? JSON.parse(m.run_meta) : m.run_meta;
              } catch { /* ignore */ }
              let trace_events: TraceEvent[] | undefined;
              try {
                trace_events = m.trace_events
                  ? (typeof m.trace_events === 'string' ? JSON.parse(m.trace_events) : m.trace_events)
                  : undefined;
              } catch { /* ignore */ }
              if (!runSummary && Array.isArray(trace_events)) {
                const rs = [...trace_events].reverse().find((e: any) => e?.type === 'run_summary');
                if (rs?.data) runSummary = rs.data;
              }
              let attachments: Attachment[] | undefined;
              try {
                const rawAtts = m.attachments
                  ? (typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments)
                  : undefined;
                if (Array.isArray(rawAtts) && rawAtts.length > 0) {
                  attachments = rawAtts.map((url: string, idx: number) => {
                    const name = decodeURIComponent((url.split('/').pop() || '附件').split('?')[0]);
                    const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
                    return {
                      id: `${m.message_id}-att-${idx}`,
                      name,
                      url,
                      type: isImage ? 'image/*' : 'application/octet-stream',
                    };
                  });
                }
              } catch { /* ignore */ }
              return {
                id: m.message_id,
                role: m.role,
                content: m.content,
                attachments,
                trace_events,
                runSummary,
              };
            }));
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

  useEffect(() => {
    if (!langMenuFor) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-lang-menu]')) return;
      setLangMenuFor(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langMenuFor]);

  useEffect(() => {
    if (!isTyping || !taskStartedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec((Date.now() - taskStartedAt) / 1000);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [isTyping, taskStartedAt]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const emitTrace = useCallback((partial: Partial<TraceEvent> & { type: string; data?: any }) => {
    onEvent({
      id: `translate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      data: {},
      ...partial,
    });
  }, [onEvent]);

  const handleTranslate = async (id: string, text: string, lang: TargetLang = targetLang) => {
    setTargetLang(lang);
    setLangMenuFor(null);

    // 1) 立刻切换消息显示语言 → 图表/i18n 马上生效（不等模型）
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              targetLang: lang,
              viewLang: lang,
              isTranslating: needsLlmTranslate(lang),
              translation: lang === '简体中文' ? undefined : m.translation,
            }
          : m
      )
    );

    // 不清理历史链路：在既有思维链后续追加「翻译」节点，便于对照
    emitTrace({ type: 'llm_start', data: { mode: 'translate', target_lang: lang } });
    emitTrace({
      type: 'tool_start',
      data: {
        name: 'translate_message',
        target_lang: lang,
        chars: text.length,
        strategy: needsLlmTranslate(lang) ? 'llm' : 'local',
      },
    });

    try {
      // 2) 简中：恢复原文
      if (lang === '简体中文') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, translation: undefined, isTranslating: false, viewLang: lang } : m
          )
        );
        emitTrace({
          type: 'tool_end',
          data: { name: 'translate_message', target_lang: lang, mode: 'restore_original' },
        });
        emitTrace({ type: 'llm_end', data: { target_lang: lang } });
        emitTrace({ type: 'stream_end', data: {} });
        message.success('已切换为简体中文（图表同步）');
        return;
      }

      // 3) 繁中：本地简→繁，保护 echarts 代码块；图表走 viewLang
      if (lang === '繁體中文') {
        const converted = convertMarkdownToTraditional(text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, translation: converted, isTranslating: false, viewLang: lang }
              : m
          )
        );
        emitTrace({
          type: 'tool_end',
          data: {
            name: 'translate_message',
            target_lang: lang,
            mode: 'local_s2t',
            chars_out: converted.length,
          },
        });
        emitTrace({ type: 'llm_end', data: { target_lang: lang } });
        emitTrace({ type: 'stream_end', data: {} });
        message.success('已本地转换为繁體中文（图表同步）');
        return;
      }

      // 4) EN / 日文：调用模型翻译（思维链可见）
      const { masked, restore, blockCount } = protectFencedBlocks(text);
      emitTrace({
        type: 'tool_start',
        data: {
          name: 'protect_fenced_blocks',
          blocks: blockCount,
          note: '已保护 echarts/代码围栏，避免模型改坏 URL',
        },
      });
      emitTrace({
        type: 'tool_end',
        data: { name: 'protect_fenced_blocks', blocks: blockCount },
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);

      let assembled = '';
      try {
        const res = await fetch(`${getApiUrl()}/chat/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: masked, target_lang: lang }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('无流式响应');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let startedStream = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.substring(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            let data: any;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            // 后端结构化事件 → 思维链（跳过已由前端发出的起点事件，避免重复节点）
            if (data.type && data.type !== 'llm_token') {
              if (data.type === 'llm_start') continue;
              if (data.type === 'tool_start' && data.data?.name === 'translate_message') continue;
              emitTrace({
                type: data.type,
                data: data.data || { name: data.name, message: data.error || data.message },
              });
            }

            const token = data.token || data.data?.token;
            if (token) {
              if (!startedStream) {
                emitTrace({ type: 'stream_start', data: { target_lang: lang } });
                startedStream = true;
              }
              assembled += typeof token === 'string' ? token : String(token);
              const preview = restore(assembled);
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, translation: preview } : m))
              );
            }

            if (data.type === 'tool_error' || data.error) {
              throw new Error(data.error || data.data?.message || '翻译失败');
            }
          }
        }

        const finalText = restore(assembled).trim();
        if (!finalText) {
          throw new Error('模型未返回译文');
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, translation: finalText, isTranslating: false, viewLang: lang }
              : m
          )
        );
        message.success(`已翻译为 ${lang}（图表同步）`);
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.name === 'AbortError' ? '翻译超时，请重试' : err?.message || '翻译失败';
      emitTrace({
        type: 'tool_error',
        data: { name: 'translate_message', message: errMsg, error: errMsg },
      });
      // 即便 LLM 失败，viewLang 已切换，图表仍有效；正文提示错误
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                isTranslating: false,
                translation:
                  m.translation ||
                  `> ⚠️ ${errMsg}\n>\n> 图表语言已切换为 **${lang}**；正文翻译失败时可重试。`,
              }
            : m
        )
      );
      message.error(errMsg);
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isTranslating: false } : m))
      );
      emitTrace({ type: 'stream_end', data: {} });
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
         let baseContent = lastUserMsg.content;
         const splitIndex = baseContent.indexOf('\\n\\n**[补充提示]**:');
         if (splitIndex !== -1) {
             baseContent = baseContent.substring(0, splitIndex);
         }
         finalPayloadMsg = baseContent + `\\n\\n**[补充提示]**: ${textToSubmit}`;
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
    setTaskStartedAt(Date.now());
    setEtaInfo(null);
    onClear();

    // 基于历史交互估算本次任务耗时
    fetch(`${getApiUrl()}/history/eta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        message: finalPayloadMsg,
        has_attachment: finalPayloadAttachments.length > 0,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.eta_sec != null) {
          setEtaInfo({
            eta_sec: data.eta_sec,
            confidence: data.confidence,
            sample_size: data.sample_size,
          });
        }
      })
      .catch(() => {});
    
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
          permission_mode: permissionMode,
          execution_mode: executionMode,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let agentMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: agentMsgId, role: 'agent', content: '' }]);

      // 活动时间线：思考/工具/输出 步骤维护
      const updateActs = (fn: (acts: Activity[]) => Activity[]) => {
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, activities: fn(m.activities || []) } : m
        ));
      };
      const startActivity = (kind: Activity['kind'], name?: string) => {
        updateActs(acts => [...closeRunningActs(acts), newActivity(kind, name)]);
      };

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
              
              if (event.type === 'llm_start') {
                startActivity('thinking');
              } else if (event.type === 'tool_start') {
                startActivity('tool', event.data?.name);
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId ? { ...m, runningToolName: event.data?.name || '未知工具', toolStartTime: Date.now() } : m
                ));
              } else if (event.type === 'tool_end') {
                updateActs(acts => closeRunningActs(acts, 'done'));
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId ? { ...m, runningToolName: undefined } : m
                ));
                if (event.data?.name) {
                  notification.success({
                    message: `✅ 工具执行完成`,
                    description: `工具 [${event.data.name}] 已成功执行。`,
                    duration: 3,
                    className: 'custom-dark-notification'
                  });
                }
              } else if (event.type === 'tool_error') {
                updateActs(acts => closeRunningActs(acts, 'error', event.data?.error || event.data?.message));
                setMessages(prev => prev.map(m => 
                  m.id === agentMsgId ? { ...m, runningToolName: undefined } : m
                ));
              } else if (event.type === 'llm_end') {
                updateActs(acts => closeRunningActs(acts, 'done'));
              } else if (event.type === 'run_summary') {
                // run_summary = 本轮结束的权威信号；立刻收口，避免"已完成"和"转圈"同时出现
                updateActs(acts => closeRunningActs(acts, 'done'));
                setMessages(prev => prev.map(m =>
                  m.id === agentMsgId
                    ? {
                        ...m,
                        runSummary: event.data as RunSummary,
                        runningToolName: undefined,
                        toolStartTime: undefined,
                        activities: closeRunningActs(m.activities || [], 'done'),
                      }
                    : m
                ));
                setIsTyping(false);
                setEtaInfo(null);
                setTaskStartedAt(null);
                onEvent({ id: 'stream_end', type: 'stream_end', timestamp: Date.now(), data: {} });
              }

              if (event.type === 'llm_token' && event.data.token) {
                if (!hasStartedStreaming) {
                  onEvent({ id: 'stream_start', type: 'stream_start', timestamp: Date.now(), data: {} });
                  hasStartedStreaming = true;
                }
                setMessages(prev => prev.map(m => {
                  if (m.id !== agentMsgId) return m;
                  // 首个 token：把"思考中"收口，切到"撰写回复"
                  let acts = m.activities || [];
                  const last = acts[acts.length - 1];
                  if (!(last && last.status === 'running' && last.kind === 'responding')) {
                    acts = [...closeRunningActs(acts), newActivity('responding')];
                  }
                  return { ...m, content: m.content + event.data.token, activities: acts };
                }));
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
      updateActs(acts => closeRunningActs(acts, 'done'));
      onEvent({ id: 'stream_end', type: 'stream_end', timestamp: Date.now(), data: {} });
      setEtaInfo(null);
      setTaskStartedAt(null);
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err: any) {
      // 收口所有未完成的活动，避免时间线卡在"运行中"
      setMessages(prev => prev.map(m =>
        m.activities?.some(a => a.status === 'running')
          ? { ...m, activities: closeRunningActs(m.activities, 'error', err?.message) }
          : m
      ));
      if (err.name === 'AbortError') {
         setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: `\n\n*[用户已手动终止执行]*` }]);
      } else {
         console.error(err);
         setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: `执行失败：${err.message}` }]);
      }
    } finally {
      setIsTyping(false);
      setEtaInfo(null);
      setTaskStartedAt(null);
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

  const handleAutoFix = useCallback((errorMsg: string) => {
    // 假执行 / 占位符 URL / 404：不要自动连打，小模型只会反复抄 chart_xxxx
    if (/假执行|沙箱工具没执行|只生成了代码|chart_x+|PLACEHOLDER|HTTP 404/i.test(errorMsg)) {
      message.warning('图表链接无效（多为模型抄写了占位符）。请新开对话重试，并确认当前模型能可靠调用工具。', 6);
      return;
    }
    const fixMessage = `[系统异常拦截]: 前端图表渲染完全崩溃！\n错误信息: ${errorMsg}\n\n**严重警告**：为了打破死循环，**禁止任何道歉、解释或“我正在执行”等废话！**\n你的回复必须【第一行就立刻发起工具调用】，调用 \`run_python_in_sandbox\`！严禁在对话中手写 JSON 或 Python 字典！对于复杂图表，请在沙箱中写 Python 代码构建 option，并用 \`from sidea_sdk import export_dashboard\` 导出，保存后原样输出沙箱返回的 URL 代码块！严禁编造或抄写 chart_xxxx 这类占位符！`;
    handleSubmit(undefined, { text: fixMessage, attachments: [] }, true);
    message.warning('图表渲染失败，正在要求助手重新调用沙箱…', 4);
  }, [handleSubmit]);

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
                    <div className="text-[var(--text-primary)]/90 leading-relaxed tracking-wide w-full overflow-hidden flex flex-col gap-2">
                      {(() => {
                        const isLast = m.id === messages[messages.length - 1].id;
                        const isLive = isTyping && isLast && !m.runSummary;
                        const acts = m.activities?.length ? m.activities : deriveActivitiesFromTrace(m.trace_events);
                        // 即便没有逐步活动，只要有 runSummary 或正在跑，也显示状态条
                        if (!acts.length && !m.runSummary && !isLive) return null;
                        const fallbackActs: Activity[] = acts.length
                          ? acts
                          : m.runSummary
                            ? [{
                                id: 'done',
                                kind: 'responding',
                                startTs: (m.runSummary.finished_at || Date.now()) - (m.runSummary.duration_ms || 0),
                                endTs: m.runSummary.finished_at || Date.now(),
                                status: 'done',
                              }]
                            : [newActivity('thinking')];
                        return (
                          <ActivityTimeline
                            activities={fallbackActs}
                            running={isLive}
                            forcedDone={!!m.runSummary || !isLive}
                          />
                        );
                      })()}
                      {m.content ? (
                        <div className="relative">
                          <MarkdownRenderer
                            content={m.content}
                            isTyping={isTyping && m.id === messages[messages.length - 1].id && !m.runningToolName && !m.runSummary}
                            onAutoFixRequest={(!isTyping && m.id === messages[messages.length - 1].id) ? handleAutoFix : undefined}
                            displayLang={m.viewLang}
                          />
                          {/* 模型常留下「正在执行…」占位文案：任务已结束后给出明确提示，避免误以为还在跑 */}
                          {!!m.runSummary && /正在执行|请稍候|稍等|executing|please wait/i.test(m.content) && (
                            <div className="mt-2 text-[11px] text-emerald-400/90 border border-emerald-500/20 bg-emerald-500/5 rounded-md px-2.5 py-1.5">
                              ✓ 本轮任务已结束。上方若仍出现「正在执行」字样，是模型中途留下的占位文案，可忽略。
                            </div>
                          )}
                        </div>
                      ) : (
                        !m.runningToolName && isTyping && !m.runSummary && (
                          <span className="animate-pulse opacity-50">▌</span>
                        )
                      )}
                      {m.runningToolName && !m.runSummary && (
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 p-3 rounded-lg bg-[#0a0a0f]/50 border border-[var(--accent-cyan)]/20 shadow-inner flex items-center justify-between overflow-hidden relative"
                        >
                          <div className="absolute top-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent w-full animate-[shimmer_2s_infinite]"></div>
                          <div className="flex items-center gap-3 text-[var(--accent-cyan)] text-sm">
                            <div className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-cyan)] opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-cyan)]"></span>
                            </div>
                            <span className="font-mono tracking-wide font-medium">正在执行工具: {m.runningToolName}...</span>
                          </div>
                          <ToolTimer startTime={m.toolStartTime || Date.now()} />
                        </motion.div>
                      )}
                      {m.role === 'agent' && m.runSummary && (
                        <RunSummaryFooter summary={m.runSummary} />
                      )}
                      {m.role === 'agent' && !m.runSummary && !isTyping && deriveSummaryFromTrace(m.trace_events) && (
                        <RunSummaryFooter summary={deriveSummaryFromTrace(m.trace_events)} />
                      )}
                    </div>
                  )}
                  {m.translation !== undefined && m.translation !== '' && (
                    <div className="mt-3 pt-3 border-t border-white/10 relative">
                      <div className="text-xs text-[var(--accent-purple)] mb-2 flex items-center gap-1">
                        <Languages size={12} /> 翻译结果 ({m.targetLang || '中文'})
                        {m.isTranslating && <span className="ml-1 opacity-70 animate-pulse">模型翻译中…</span>}
                      </div>
                      <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1a1b26] prose-pre:border prose-pre:border-white/10 max-w-none text-[0.95rem]">
                        <MarkdownRenderer content={m.translation} displayLang={m.viewLang || m.targetLang} />
                      </div>
                    </div>
                  )}
                  {m.isTranslating && !m.translation && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-xs text-[var(--accent-purple)] flex items-center gap-2">
                      <Loader size={12} className="animate-spin" />
                      正在调用模型翻译为 {m.targetLang}…（图表语言已先切换，详见右侧思维链）
                    </div>
                  )}
                </div>
                
                {/* Action Bar */}
                <div className={`flex gap-2 mt-1 transition-opacity ${langMenuFor === m.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {m.role === 'agent' && (
                    <div className="flex items-center bg-black/20 rounded-md border border-white/5 overflow-hidden mr-1">
                      <Tooltip title="导出为 PDF" placement="bottom"><button onClick={() => handleExportPDF(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><Download size={14} /></button></Tooltip>
                      <Tooltip title="导出为 PNG" placement="bottom"><button onClick={() => handleExportImage(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><ImageDown size={14} /></button></Tooltip>
                      <Tooltip title="导出为 Markdown" placement="bottom"><button onClick={() => handleExportMarkdown(m)} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"><FileDown size={14} /></button></Tooltip>
                    </div>
                  )}
                  {m.role === 'agent' && (
                    <div className="relative flex items-center bg-black/20 rounded-md border border-white/5 overflow-visible">
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
                      <div className="relative" data-lang-menu>
                        <Tooltip title={`翻译为 ${targetLang}（点击选择语言）`} placement="bottom">
                          <button
                            onClick={() => setLangMenuFor(langMenuFor === m.id ? null : m.id)}
                            className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-[var(--accent-cyan)] transition-colors"
                            disabled={m.isTranslating}
                          >
                            <Languages size={14} className={m.isTranslating ? "animate-pulse" : ""} />
                          </button>
                        </Tooltip>
                        {langMenuFor === m.id && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[96px] rounded-lg border border-white/10 bg-[#1a1b26]/95 backdrop-blur-md shadow-xl py-1 overflow-hidden">
                            {TARGET_LANG_OPTIONS.map((opt) => {
                              const selected = (m.targetLang || targetLang) === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => handleTranslate(m.id, m.content, opt.value)}
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
                  <Tooltip title="引用回复 (支持选中文本片段)" placement="bottom">
                    <button 
                      onClick={() => {
                        const selection = window.getSelection()?.toString().trim();
                        if (selection) {
                          setReplyTo({ ...m, content: selection });
                          window.getSelection()?.removeAllRanges();
                        } else {
                          setReplyTo(m);
                        }
                      }}
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
          
          {/* 底部临时气泡：仅在还没有 agent 消息占位时显示，避免与消息内时间线双重转圈 */}
          {isTyping && messages[messages.length - 1]?.role !== 'agent' && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }} 
               animate={{ opacity: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.9 }}
               className="flex flex-col gap-2 w-full"
             >
               <div className="flex gap-4 justify-start w-full">
                 <div className="w-10 h-10 rounded-full bg-[var(--accent-cyan)]/10 flex items-center justify-center border border-[var(--accent-cyan)]/40 animate-border-glow shadow-[0_0_15px_rgba(0,242,254,0.2)]">
                    <Loader size={20} className="text-[var(--accent-cyan)] animate-spin" />
                 </div>
                 <div className="message-bubble-agent rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-2 shadow-lg backdrop-blur-md h-[48px]">
                   <span className="w-2 h-2 bg-[var(--accent-cyan)] rounded-full animate-ping"></span>
                   <span className="w-2 h-2 bg-[var(--accent-blue)] rounded-full animate-ping" style={{animationDelay: '0.2s'}}></span>
                   <span className="w-2 h-2 bg-[var(--accent-purple)] rounded-full animate-ping" style={{animationDelay: '0.4s'}}></span>
                 </div>
               </div>
               {etaInfo && (
                 <div className="ml-14 mr-2">
                   <EtaBanner
                     etaSec={etaInfo.eta_sec}
                     confidence={etaInfo.confidence}
                     sampleSize={etaInfo.sample_size}
                     elapsedSec={elapsedSec}
                   />
                 </div>
               )}
             </motion.div>
          )}
          {isTyping && messages[messages.length - 1]?.role === 'agent' && etaInfo && (
            <div className="ml-14 mr-2 mb-2">
              <EtaBanner
                etaSec={etaInfo.eta_sec}
                confidence={etaInfo.confidence}
                sampleSize={etaInfo.sample_size}
                elapsedSec={elapsedSec}
              />
            </div>
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
                <span className="text-[var(--accent-cyan)] mr-2">{replyTo.role === 'agent' ? t('reply_to_agent') : t('reply_to_user')}</span>
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
            title={t('upload_tip')}
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
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div> {t('stop_generating')}
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
              className="relative w-full bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl pl-5 pr-5 pt-4 pb-14 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors placeholder-[var(--text-secondary)] resize-none min-h-[60px] max-h-[200px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
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
                  <option value="auto" className="bg-[#1a1b26] text-gray-300">{t('depth_auto')}</option>
                  <option value="deep" className="bg-[#1a1b26] text-[var(--accent-purple)]">{t('depth_deep')}</option>
                  <option value="fast" className="bg-[#1a1b26] text-green-400">{t('depth_fast')}</option>
                </select>
              </div>
              <div className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                executionMode === 'goal' ? 'text-[var(--accent-cyan)] border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10' :
                executionMode === 'react' ? 'text-orange-400 border-orange-400/50 bg-orange-400/10' :
                'text-[var(--text-secondary)] border-[var(--accent-cyan)]/30 bg-black/40 hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/60'
              }`} title={t('exec_hint') || '执行模式：自动识别大屏并拆分子任务'}>
                <Layers size={12} className="mr-1" />
                <select value={executionMode} onChange={(e) => setExecutionMode(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center font-medium">
                  <option value="auto" className="bg-[#1a1b26] text-gray-300">{t('exec_auto') || '执行: 自动'}</option>
                  <option value="goal" className="bg-[#1a1b26] text-[var(--accent-cyan)]">{t('exec_goal') || '执行: 目标拆分'}</option>
                  <option value="react" className="bg-[#1a1b26] text-orange-400">{t('exec_react') || '执行: 自由 ReAct'}</option>
                </select>
              </div>
              <div className={`flex items-center border rounded-md px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                contextLength === '128k' ? 'text-red-400 border-red-400/50 bg-red-400/10' :
                contextLength === '32k' ? 'text-orange-400 border-orange-400/50 bg-orange-400/10' :
                'text-[var(--text-secondary)] border-[var(--accent-purple)]/30 bg-black/40 hover:text-[var(--accent-purple)] hover:border-[var(--accent-purple)]/60'
              }`} title="上下文长度">
                <Database size={12} className="mr-1" />
                <select value={contextLength} onChange={(e) => setContextLength(e.target.value)} className="bg-transparent outline-none cursor-pointer appearance-none text-center font-medium">
                  <option value="8k" className="bg-[#1a1b26] text-gray-300">{t('ctx_8k')}</option>
                  <option value="32k" className="bg-[#1a1b26] text-orange-400">{t('ctx_32k')}</option>
                  <option value="128k" className="bg-[#1a1b26] text-red-400">{t('ctx_128k')}</option>
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
                  {useKnowledgeBase ? t('kb_on') : t('kb_off')}
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
                    <option value="ask_always" className="bg-[#1a1b26] text-red-400">{t('perm_ask_always')}</option>
                    <option value="ask_risky" className="bg-[#1a1b26] text-orange-400">{t('perm_ask_risky')}</option>
                    <option value="full_access" className="bg-[#1a1b26] text-green-400">{t('perm_full')}</option>
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
            <div className="pointer-events-none absolute inset-0 w-full h-full bg-white/20 opacity-0 -translate-x-full group-hover:opacity-100 group-hover:animate-[shimmer_1.5s_infinite]"></div>
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
                  <h3 className="text-lg font-bold tracking-wider">{t('ai_outputting')}</h3>
                </div>
                <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">
                  {t('interrupt_question')}
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
                    {t('interrupt_inject')}
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
                    {t('interrupt_queue')}
                  </button>
                  <button 
                    onClick={() => setInterruptPrompt(null)}
                    className="w-full py-2 mt-2 rounded-lg text-[var(--text-secondary)] hover:text-white transition-colors text-sm"
                  >
                    {t('interrupt_cancel')}
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
