import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { v4 as uuidv4 } from 'uuid';
import ReactECharts from 'echarts-for-react';
import 'echarts-gl';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Maximize2, X, ZoomIn, ZoomOut, Maximize, Download, FileImage, FileText, Copy, Loader } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { message, Image } from 'antd';
import { getBaseUrl } from '../config';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import {
  DashboardGrid,
  normalizeChartPayload,
  applyThemeToOption,
} from './DashboardPanel';
import { TemplatedDashboard } from './TemplatedDashboard';
import { DashboardV2, isDashboardDslV2, DashboardV2Shell } from '../dashboard';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

interface MarkdownRendererProps {
  content: string;
  isTyping?: boolean;
  onAutoFixRequest?: (errorMsg: string) => void;
  /** 覆盖全局语言，用于消息级翻译结果中的图表 i18n */
  displayLang?: string;
}

const ExportableTable = ({ children, ...props }: any) => {
  const tableRef = useRef<HTMLTableElement>(null);
  
  const handleExport = () => {
    if (tableRef.current) {
       try {
         const wb = XLSX.utils.table_to_book(tableRef.current);
         XLSX.writeFile(wb, `SIDEA_Table_${new Date().getTime()}.xlsx`);
         message.success("表格导出 Excel 成功！");
       } catch (err) {
         console.error(err);
         message.error("表格导出失败");
       }
    }
  };
  
  return (
    <div className="relative group my-5 rounded-xl border border-white/10 shadow-lg bg-[#1a1b26] pt-10">
      <button 
        onClick={handleExport}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10 hover:bg-[var(--accent-cyan)]/20 text-xs flex items-center gap-1.5 font-medium z-10"
      >
        <Download size={14} /> 导出 Excel
      </button>
      <div className="overflow-x-auto rounded-b-xl pb-2">
        <table ref={tableRef} className="min-w-full divide-y divide-white/10 border-collapse m-0 px-2" {...props}>
          {children}
        </table>
      </div>
    </div>
  );
};

/** 模型常把提示词里的占位符原样抄出，这类 URL 绝不是真实产物 */
function isPlaceholderChartUrl(url: string): boolean {
  const u = (url || '').trim();
  if (!u) return true;
  if (/chart_x+|chart_X+|chart_placeholder|chart_example|chart_demo/i.test(u)) return true;
  // 真实产物必须是 chart_<纯数字毫秒>.json
  if (/\/sandbox_workspace\/chart_/i.test(u) && !/\/sandbox_workspace\/chart_\d+\.json/i.test(u)) return true;
  return false;
}

function isPlaceholderSceneUrl(url: string): boolean {
  const u = (url || '').trim();
  if (!u) return true;
  if (/scene_x+|scene_placeholder|scene_example|scene_demo/i.test(u)) return true;
  if (/\/sandbox_workspace\/scene_/i.test(u) && !/\/sandbox_workspace\/scene_\d+\.html/i.test(u)) return true;
  return false;
}

/** 沙箱 Three.js / HTML 场景：iframe + sandbox 隔离 */
const SceneHtmlFrame = ({ url }: { url: string }) => {
  const { theme } = useAppStore();
  const fake = isPlaceholderSceneUrl(url);
  if (fake) {
    return (
      <div className="my-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs text-amber-200/90">
        场景 URL 无效或为占位符，无法 iframe 渲染。
      </div>
    );
  }
  const urlWithTheme = url.includes('?') ? `${url}&theme=${theme}` : `${url}?theme=${theme}`;
  
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2 text-[11px] tracking-wide text-[var(--text-secondary)]">
        <span>SCENE · HTML + Three.js（sandbox iframe）</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-cyan)] hover:underline"
        >
          新窗口打开
        </a>
      </div>
      <iframe
        title="SIDEA Scene"
        src={urlWithTheme}
        className="block h-[min(72vh,720px)] w-full bg-[var(--bg-primary)]"
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

const AsyncEChartsWrapper = ({
  url,
  theme,
  onAutoFixRequest,
  displayLang,
}: {
  url: string;
  theme: string;
  onAutoFixRequest?: (errorMsg: string) => void;
  displayLang?: string;
}) => {
  const [raw, setRaw] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { i18n } = useTranslation();
  const { language } = useAppStore();
  const activeLang = displayLang || language || i18n.language;
  const isFakeUrl = isPlaceholderChartUrl(url);

  useEffect(() => {
    let cancelled = false;
    setRaw(null);
    setError(null);
    if (isFakeUrl) {
      setError('PLACEHOLDER_URL');
      return;
    }
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((parsed) => {
        if (!cancelled) setRaw(parsed);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [url, isFakeUrl]);

  const payload = useMemo(() => (raw ? normalizeChartPayload(raw, activeLang) : null), [raw, activeLang]);

  if (error === 'PLACEHOLDER_URL') {
    return (
      <div className="w-full my-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 text-sm leading-relaxed">
        <div className="font-semibold mb-1">检测到假图表链接（占位符）</div>
        <div className="opacity-90">
          助手抄写了示例 URL（如 <code className="px-1">chart_xxxx.json</code>），并未真正调用沙箱。请<strong>新开对话</strong>重试，或换更大的模型；不要继续点自动修复。
        </div>
        <div className="mt-2 text-xs opacity-70 font-mono break-all">{url}</div>
      </div>
    );
  }

  if (error) {
    // 占位符 / 明显假 URL 的 404 不再触发 autofix，避免死循环
    const allowAutofix = !isFakeUrl && !/HTTP 404/i.test(error);
    return (
      <EChartsParseError
        codeString={url}
        errorMsg={`Failed to load chart JSON: ${error}`}
        onAutoFixRequest={allowAutofix ? onAutoFixRequest : undefined}
      />
    );
  }

  if (!raw || !payload) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center border border-[var(--accent-cyan)]/30 rounded-xl bg-[var(--accent-cyan)]/5 my-4 text-[var(--accent-cyan)]">
        <Loader className="animate-spin mb-3" size={28} />
        <span className="text-sm font-bold tracking-widest animate-pulse">正在下载并渲染图表大屏...</span>
      </div>
    );
  }

  if (payload.kind === 'dashboard') {
    if (payload.template) {
      return (
        <TemplatedDashboard
          title={payload.title}
          panels={payload.panels}
          theme={theme}
          templateId={payload.template}
          language={activeLang}
          model3d_url={payload.model3d_url}
          dsl={payload.dsl}
        />
      );
    }
    // Native DSL v2 → widget registry renderer
    if (payload.dsl && isDashboardDslV2(payload.dsl)) {
      return (
        <DashboardV2Shell
          doc={payload.dsl}
          theme={theme}
          language={activeLang}
          sourceCode={JSON.stringify(raw, null, 2)}
        />
      );
    }
    return (
      <DashboardGrid
        title={payload.title}
        panels={payload.panels}
        theme={theme}
        onAutoFixRequest={onAutoFixRequest}
        sourceCode={JSON.stringify(raw, null, 2)}
        raw={raw}
        language={activeLang}
      />
    );
  }

  return (
    <EChartsWrapper
      option={applyThemeToOption(payload.option, theme, activeLang)}
      codeString={JSON.stringify(raw, null, 2)}
      theme={theme}
      onAutoFixRequest={onAutoFixRequest}
    />
  );
};

const MarkdownRenderer = React.memo(({ content, isTyping, onAutoFixRequest, displayLang }: MarkdownRendererProps) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const { i18n } = useTranslation();
  const { theme, language } = useAppStore();
  const activeLang = displayLang || language || i18n.language;

  const components = React.useMemo(() => {
    // 同一条回复里若已有可渲染的图表 URL，就把 Python 示例当普通代码，绝不触发 autofix 死循环
    // 只有真实毫秒时间戳 chart_数字.json 才算产物；chart_xxxx 等占位符不算
    const hasChartArtifact =
      /https?:\/\/[^\s`'"]+\/sandbox_workspace\/chart_\d+\.json/i.test(content || '');

    return {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-([\w-]+)/.exec(className || '');
      const lang = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && lang === 'mermaid') {
        return <MermaidChart chart={codeString} isTyping={isTyping} />;
      }

      if (!inline && (lang === 'scene-html' || lang === 'scene_html' || lang === 'scene')) {
        const urlMatch =
          codeString.match(/https?:\/\/[^\s"'`]+?\.html/i) ||
          codeString.match(/https?:\/\/[^\s"'`]+\/sandbox_workspace\/scene_\d+\.html/i);
        if (urlMatch) {
          return <SceneHtmlFrame url={urlMatch[0]} />;
        }
        if (isTyping) {
          return (
            <div className="w-full h-[160px] flex flex-col items-center justify-center border border-[var(--accent-cyan)]/30 rounded-xl bg-[var(--accent-cyan)]/5 my-4 text-[var(--accent-cyan)]">
              <Loader className="animate-spin mb-3" size={24} />
              <span className="text-sm font-bold tracking-widest animate-pulse">三维场景构建中…</span>
            </div>
          );
        }
        return (
          <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
            期望 ```scene-html``` 内为 sandbox_workspace/scene_*.html 的 URL。
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] whitespace-pre-wrap">{codeString}</pre>
          </div>
        );
      }
      
      // Python + SDK：有图表产物时正常展示代码；无产物时只提示，不自动发起 autofix（避免死循环）
      if (!inline && (lang === 'python' || lang === 'py')) {
        if (
          !hasChartArtifact &&
          (codeString.includes('export_dashboard') || codeString.includes('sidea_sdk') || codeString.includes('export_echarts'))
        ) {
          if (isTyping) {
            return (
              <div className="w-full h-[120px] flex flex-col items-center justify-center border border-[var(--accent-cyan)]/30 rounded-xl bg-[var(--accent-cyan)]/5 my-4 text-[var(--accent-cyan)]">
                <Loader className="animate-spin mb-3" size={24} />
                <span className="text-sm font-bold tracking-widest animate-pulse">等待沙箱导出图表…</span>
              </div>
            );
          }
          return (
            <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              这段是 Python 源码，前端不会直接渲染。正确交付应包含
              <code className="mx-1">```echarts-i18n</code>
              的图表 URL。请让助手调用 <code className="mx-1">run_python_in_sandbox</code> 后重试。
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] text-slate-300 whitespace-pre-wrap">{codeString}</pre>
            </div>
          );
        }
      }

      if (!inline && (lang === 'echarts' || lang === 'json' || lang === 'echarts-i18n' || lang === 'javascript' || lang === 'js' || !lang)) {
        const urlMatch = codeString.match(/https?:\/\/[^\s"'`]+?\.json/i);
        if (urlMatch && !codeString.includes('series') && !codeString.includes('xAxis') && !codeString.trim().startsWith('{')) {
          return <AsyncEChartsWrapper url={urlMatch[0]} theme={theme} onAutoFixRequest={onAutoFixRequest} displayLang={activeLang} />;
        }
        
        try {
          const cleanCodeString = codeString
            // 匹配字符串并保留，匹配单行/多行注释并删除
            .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\/.*$|\/\*[\s\S]*?\*\//gm, (match, grp) => grp ? grp : '')
            // 剔除尾部逗号 (Trailing commas) 确保 JSON.parse 兼容
            .replace(/,\s*([\]}])/g, '$1');
            
          let parsed: any = null;
          try {
            parsed = JSON.parse(cleanCodeString);
          } catch (jsonError) {
            // Fallback: Try to evaluate it as Javascript if JSON.parse fails (e.g. unquoted keys, full JS script)
            try {
              // Try evaluating just as an object literal first
              if (cleanCodeString.trim().startsWith('{') && cleanCodeString.trim().endsWith('}')) {
                 parsed = new Function(`return ${cleanCodeString}`)();
              } else {
                 // Try evaluating as a full script and extract option
                 parsed = new Function(`
                   let _detectedOption = null;
                   try {
                     ${cleanCodeString}
                     if (typeof option !== 'undefined') _detectedOption = option;
                     else if (typeof chartOption !== 'undefined') _detectedOption = chartOption;
                     else if (typeof echartOption !== 'undefined') _detectedOption = echartOption;
                   } catch(e) {}
                   return _detectedOption;
                 `)();
              }
            } catch (jsError) {
               if (cleanCodeString.includes('True') || cleanCodeString.includes('False') || cleanCodeString.includes('None')) {
                 throw new Error('解析失败：检测到你输出了 Python 字典格式！前端无法直接渲染 Python 代码，请务必使用 run_python_in_sandbox 工具执行，并在沙箱中使用 json.dump 保存为 chart_option.json！');
               }
               throw new Error('解析失败：既不是标准 JSON，也不是可执行的配置脚本。请勿在对话中手写图表配置，必须调用沙箱工具并生成 chart_option.json！');
            }
          }
          
          if (!parsed) {
             throw new Error('解析失败：未能从代码中提取到 option 对象。');
          }

          const normalized = normalizeChartPayload(parsed, activeLang);
          if (!normalized) {
            throw new Error('解析失败：JSON 不是可识别的 ECharts option / dashboard 结构。');
          }
          if (normalized.kind === 'dashboard') {
            if (normalized.dsl && isDashboardDslV2(normalized.dsl)) {
              return (
                <DashboardV2Shell
                  doc={normalized.dsl}
                  theme={theme}
                  language={activeLang}
                  sourceCode={codeString}
                />
              );
            }
            return (
              <DashboardGrid
                title={normalized.title}
                panels={normalized.panels}
                theme={theme}
                onAutoFixRequest={onAutoFixRequest}
                sourceCode={codeString}
                raw={parsed}
                language={activeLang}
              />
            );
          }
          return (
            <EChartsWrapper
              option={applyThemeToOption(normalized.option, theme, activeLang)}
              codeString={codeString}
              theme={theme}
              onAutoFixRequest={onAutoFixRequest}
            />
          );
        } catch (e: any) {
          if (lang === 'echarts' || lang === 'echarts-i18n' || codeString.includes('series') || codeString.includes('xAxis') || codeString.includes('option =')) {
            if (isTyping) {
              return (
                <div className="w-full h-[200px] flex flex-col items-center justify-center border border-[var(--accent-cyan)]/30 rounded-xl bg-[var(--accent-cyan)]/5 my-4 text-[var(--accent-cyan)]">
                  <Loader className="animate-spin mb-3" size={28} />
                  <span className="text-sm font-bold tracking-widest animate-pulse">大屏图表生成中...</span>
                </div>
              );
            }
            return <EChartsParseError codeString={codeString} errorMsg={e.message || 'JSON 语法错误'} onAutoFixRequest={onAutoFixRequest} />;
          }
        }
      }

      const isFileName = /\.(png|jpg|jpeg|gif|csv|xlsx|txt)$/i.test(codeString.trim()) && !codeString.includes('\n');

      if (isFileName) {
        return (
          <code 
            className={`inline-block bg-[var(--bg-dark)] px-1.5 py-0.5 rounded text-[0.9em] font-mono border border-[var(--border-color)] text-[var(--accent-purple)] cursor-pointer hover:shadow-[0_0_10px_var(--accent-purple)] transition-all underline decoration-dashed underline-offset-4`}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                 e.preventDefault();
                 fetch(`${getBaseUrl()}/api/sandbox/open?file=${encodeURIComponent(codeString.trim())}`);
                 message.success(`正在打开文件目录: ${codeString}`);
              } else if (/\.(png|jpg|jpeg|gif)$/i.test(codeString)) {
                 setPreviewImage(`${getBaseUrl()}/sandbox_workspace/${codeString.trim()}`);
              }
            }}
            title="单击预览图片，按住 Ctrl/Cmd + 单击在本地打开文件位置"
            {...props}
          >
            {codeString.trim()}
          </code>
        );
      }

      return !inline ? (
        <div className="bg-[var(--bg-dark)] p-4 rounded-xl overflow-x-auto my-3 border border-[var(--border-color)] shadow-inner text-[0.9em] relative group/code">
          <div className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity z-10">
            <button 
              onClick={() => {
                navigator.clipboard.writeText(codeString);
                message.success('已复制代码');
              }}
              className="p-1.5 bg-[#1a1b26]/80 backdrop-blur border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-md text-gray-300 hover:text-white transition-all shadow-sm"
              title="复制代码"
            >
              <Copy size={14} />
            </button>
          </div>
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      ) : (
        <code className="bg-[var(--bg-dark)] px-1.5 py-0.5 rounded text-[0.9em] text-[var(--accent-cyan)] font-mono border border-[var(--border-color)]" {...props}>
          {children}
        </code>
      );
    },
    table: ({ node, ...props }: any) => <ExportableTable {...props} />,
    thead: ({ node, ...props }: any) => <thead className="bg-white/5" {...props} />,
    th: ({ node, ...props }: any) => <th className="px-4 py-3 text-left text-xs font-bold text-[var(--accent-cyan)] uppercase tracking-wider m-0 border-0" {...props} />,
    td: ({ node, ...props }: any) => <td className="px-4 py-3 text-sm text-[var(--text-primary)] m-0 border-t border-white/10" {...props} />,
    tr: ({ node, ...props }: any) => <tr className="hover:bg-white/5 transition-colors m-0" {...props} />,
    img: ({ node, ...props }: any) => <img className="rounded-xl shadow-lg border border-white/10" {...props} />,
    p: ({ node, ...props }: any) => <div className="mb-4 last:mb-0" {...props} />,
  };
  }, [isTyping, activeLang, theme, onAutoFixRequest, content]);

  let processedContent = content;
  if (
    !isTyping &&
    ((processedContent.includes('"i18n"') && processedContent.includes('"option"')) ||
      processedContent.includes('"type": "dashboard"') ||
      processedContent.includes('"type":"dashboard"'))
  ) {
    if (!processedContent.includes('```echarts') && !processedContent.includes('```json')) {
      const jsonStart = processedContent.indexOf('{');
      const jsonEnd = processedContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const possibleJson = processedContent.substring(jsonStart, jsonEnd + 1);
        try {
          JSON.parse(possibleJson);
          processedContent = processedContent.replace(possibleJson, '\n```echarts-i18n\n' + possibleJson + '\n```\n');
        } catch (e) {}
      }
    }
  }

  return (
    <>
      <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
      {previewImage && (
        <Image 
          width={0}
          style={{ display: 'none' }}
          src={previewImage}
          preview={{
            visible: !!previewImage,
            src: previewImage,
            onVisibleChange: (value) => {
              if (!value) setPreviewImage(null);
            }
          }}
        />
      )}
    </>
  );
});

function EChartsParseError({ codeString, errorMsg, onAutoFixRequest }: { codeString: string, errorMsg: string, onAutoFixRequest?: (msg: string) => void }) {
  const [showSource, setShowSource] = useState(false);
  const hasRequestedFix = useRef(false);

  useEffect(() => {
    if (onAutoFixRequest && !hasRequestedFix.current) {
      hasRequestedFix.current = true;
      onAutoFixRequest(`[JSON Parse Error] ${errorMsg}`);
    }
  }, [errorMsg, onAutoFixRequest]);

  return (
    <div className="w-full block overflow-x-auto relative group/echarts my-4 border border-[var(--border-color)] rounded-xl bg-[var(--bg-panel)] p-2 min-h-[100px]">
      <div className="absolute top-2 right-2 opacity-0 group-hover/echarts:opacity-100 transition-opacity z-10 flex gap-2">
        <button 
          onClick={() => setShowSource(!showSource)}
          className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1b26]/80 backdrop-blur border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 hover:border-[var(--accent-cyan)] rounded-md text-[var(--accent-cyan)] transition-all shadow-lg text-xs"
        >
          <FileText size={14} /> {showSource ? '查看错误' : '查看源码'}
        </button>
      </div>
      {showSource ? (
        <div className="p-4 bg-[var(--bg-dark)] rounded text-[0.9em] overflow-x-auto text-gray-300 font-mono mt-8 border border-white/5">
          <pre><code>{codeString}</code></pre>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 text-red-400 gap-4 bg-red-500/10 rounded-lg border border-red-500/30 w-full min-h-[200px] mt-8">
          <div className="font-bold flex items-center gap-2"><X size={18} /> 图表配置解析失败</div>
          <div className="text-sm opacity-80 font-mono text-center px-4">{errorMsg}</div>
          <div className="text-xs mt-2 text-white/50">大模型生成的 JSON 语法有误（如缺少引号、括号不匹配）。请点击右上角「查看源码」检查</div>
        </div>
      )}
    </div>
  );
}

class EChartsErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, errorMsg: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error.message };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ECharts Render Error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-red-400 gap-4 bg-red-500/10 rounded-lg border border-red-500/30 w-full h-[200px]">
          <div className="font-bold flex items-center gap-2"><X size={18} /> 图表渲染崩溃</div>
          <div className="text-sm opacity-80 font-mono text-center px-4">{this.state.errorMsg || '底层渲染引擎异常'}</div>
          <div className="text-xs mt-2 text-white/50">请点击右上角「查看源码」检查大模型生成的 JSON 是否合法</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function EChartsWrapper({
  option,
  codeString,
  theme,
  onAutoFixRequest,
  height,
  compact,
}: {
  option: any;
  codeString: string;
  theme: string;
  onAutoFixRequest?: (msg: string) => void;
  height?: string;
  compact?: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const chartHeight =
    height ||
    (Array.isArray(option.grid) && option.grid.length > 1
      ? '550px'
      : Array.isArray(option.series) && option.series.length > 2
        ? '450px'
        : '350px');
  const hasRequestedFix = useRef(false);

  // 启发式校验：双 Y 轴共享同一 grid 是合法的；按 xAxisIndex 统计笛卡尔网格数
  let layoutError = '';
  try {
    const grids = Array.isArray(option.grid) ? option.grid : option.grid ? [option.grid] : [];
    const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];

    const validTypes = [
      'line', 'bar', 'pie', 'scatter', 'effectScatter', 'radar', 'tree', 'treemap', 'sunburst',
      'boxplot', 'candlestick', 'heatmap', 'map', 'parallel', 'lines', 'graph', 'sankey',
      'funnel', 'gauge', 'pictorialBar', 'themeRiver', 'custom',
    ];
    const invalidTypes = series
      .map((s: any) => s.type)
      .filter((t: any) => t && !validTypes.includes(t) && !String(t).toLowerCase().endsWith('3d'));

    if (invalidTypes.length > 0) {
      layoutError = `不受支持的图表类型: ${invalidTypes.join(', ')}。ECharts 不支持此类型，请改用有效的标准图表类型(如 line, bar 等)。`;
    }

    const nonPie = series.filter((s: any) => ['line', 'bar', 'scatter', 'heatmap'].includes(s.type));
    // 双 Y（同一 xAxisIndex、不同 yAxisIndex）算同一网格，不视为越界
    const gridIndices = new Set(nonPie.map((s: any) => s.xAxisIndex || 0));

    if (!layoutError && gridIndices.size > Math.max(grids.length, 1)) {
      layoutError = `坐标系越界: 图表引用了 ${gridIndices.size} 个网格，但配置中只定义了 ${grids.length} 个网格。请使用 export_dashboard 按独立面板导出。`;
    }

    // 仅当 ≥4 个非饼系列挤在同一 x 轴且只有 1 个 grid 时告警（双 Y combo 通常 2 个 series）
    if (!layoutError && nonPie.length >= 4 && gridIndices.size === 1 && grids.length <= 1) {
      layoutError = `严重布局重叠: 检测到 ${nonPie.length} 个非饼图系列拥挤在同一个坐标系中。请使用 export_dashboard 拆成独立面板！`;
    }

    const has3D = series.some((s: any) => s.type && String(s.type).toLowerCase().endsWith('3d'));
    if (!layoutError && has3D && !option.grid3D) {
      layoutError = `缺少 3D 坐标系: 包含了 3D 图表系列，但未定义 grid3D、xAxis3D、yAxis3D 等组件。请使用 export_dashboard(type='bar3d')。`;
    }
  } catch (e) {
    layoutError = 'JSON 结构分析异常';
  }

  useEffect(() => {
    if (layoutError && onAutoFixRequest && !hasRequestedFix.current) {
      hasRequestedFix.current = true;
      onAutoFixRequest(`[Layout Collision Error] ${layoutError}`);
    }
  }, [layoutError, onAutoFixRequest]);

  const wrapperClass = compact
    ? 'w-full block relative group/echarts p-1 min-h-[80px]'
    : 'w-full block overflow-x-auto relative group/echarts my-4 border border-[var(--border-color)] rounded-xl bg-[var(--bg-panel)] p-2 min-h-[100px]';

  return (
    <div className={wrapperClass}>
      <div className="absolute top-2 right-2 opacity-0 group-hover/echarts:opacity-100 transition-opacity z-10 flex gap-2">
        <button
          onClick={() => setShowSource(!showSource)}
          className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1b26]/80 backdrop-blur border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 hover:border-[var(--accent-cyan)] rounded-md text-[var(--accent-cyan)] transition-all shadow-lg text-xs"
          title="切换视图"
        >
          <FileText size={14} /> {showSource ? '查看图表' : '查看源码'}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(codeString);
            message.success('已复制 ECharts 完整配置 JSON');
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1b26]/80 backdrop-blur border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 hover:border-[var(--accent-cyan)] rounded-md text-[var(--accent-cyan)] transition-all shadow-lg text-xs"
          title="复制图表配置 JSON"
        >
          <Copy size={14} /> 复制配置
        </button>
      </div>
      {showSource ? (
        <div className="p-4 bg-[var(--bg-dark)] rounded text-[0.9em] overflow-x-auto text-gray-300 font-mono mt-8 border border-white/5">
          <pre><code>{codeString}</code></pre>
        </div>
      ) : layoutError ? (
        <div className="flex flex-col items-center justify-center p-8 text-red-400 gap-4 bg-red-500/10 rounded-lg border border-red-500/30 w-full h-[250px] mt-8">
          <div className="font-bold flex items-center gap-2"><X size={18} /> 大模型排版错误拦截</div>
          <div className="text-sm opacity-80 font-mono text-center px-4">{layoutError}</div>
          <div className="text-xs mt-2 text-white/50">请点击右上角「查看源码」，或提示模型使用 `export_dashboard` 自动排版引擎</div>
        </div>
      ) : (
        <div style={{ minWidth: compact ? undefined : '500px', width: '100%' }}>
          <EChartsErrorBoundary>
            <ReactECharts
              option={option}
              style={{ height: chartHeight, width: '100%' }}
              theme={theme}
              notMerge={true}
              lazyUpdate={true}
            />
          </EChartsErrorBoundary>
        </div>
      )}
    </div>
  );
}

export default MarkdownRenderer;

function MermaidChart({ chart, isTyping }: { chart: string, isTyping?: boolean }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const id = useRef(`mermaid-${uuidv4().replace(/-/g, '')}`);

  // Sanitize common LLM syntax errors
  let sanitizedChart = chart
    .replace(/^graph /mi, 'flowchart ')
    .replace(/--->/g, '-->')
    .replace(/<---/g, '<--')
    .replace(/====>/g, '==>');

  // Convert "A -- text --> B" to standard "A -->|text| B"
  sanitizedChart = sanitizedChart.replace(/--\s+([^>]+?)\s+-->/g, '-->|$1|');

  sanitizedChart = sanitizedChart.split('\n').map(line => {
    let tLine = line.trim();
    if (tLine.startsWith('subgraph ')) {
      let name = tLine.substring(9).trim();
      if (!name.includes('[')) {
        let cleanName = name.replace(/^"|"$/g, '');
        let safeId = "sg_" + cleanName.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '');
        return line.replace(tLine, `subgraph ${safeId} ["${cleanName}"]`);
      }
      return line;
    }
    
    let l = line;
    
    // 1. Quote edge labels that are not quoted
    l = l.replace(/\|([^|"]+)\|/g, '|"$1"|');

    // 2. Protect edge labels |...|
    let pipes = [];
    l = l.replace(/\|([^|]+)\|/g, match => { pipes.push(match); return `__P${pipes.length-1}__`; });

    // 3. Protect existing quotes
    let quotes = [];
    l = l.replace(/"[^"]*"/g, match => { quotes.push(match); return `__Q${quotes.length-1}__`; });

    // 4. Replace [ ]
    l = l.replace(/(^|\s|>|-|&|\|)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\[([^\]]+)\]/g, '$1$2["$3"]');
    l = l.replace(/"[^"]*"/g, match => { quotes.push(match); return `__Q${quotes.length-1}__`; });

    // 5. Replace ( )
    l = l.replace(/(^|\s|>|-|&|\|)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\(([^)]+)\)/g, '$1$2("$3")');
    l = l.replace(/"[^"]*"/g, match => { quotes.push(match); return `__Q${quotes.length-1}__`; });

    // 6. Replace { }
    l = l.replace(/(^|\s|>|-|&|\|)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\{([^}]+)\}/g, '$1$2{"$3"}');
    l = l.replace(/"[^"]*"/g, match => { quotes.push(match); return `__Q${quotes.length-1}__`; });
    
    // 7. Restore quotes
    for (let i = quotes.length - 1; i >= 0; i--) {
       l = l.replace(`__Q${i}__`, quotes[i]);
    }
    
    // 8. Restore pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
       l = l.replace(`__P${i}__`, pipes[i]);
    }

    return l;
  }).join('\n');

  useEffect(() => {
    let mounted = true;
    
    // Do not attempt to render if the LLM is still typing out the chart to prevent flickering
    if (isTyping) {
      if (mounted) {
        setIsError(false);
        setErrorMsg('');
        setSvg('');
      }
      return;
    }

    try {
      mermaid.render(id.current, sanitizedChart).then(({ svg }) => {
        if (mounted) {
          setSvg(svg);
          setIsError(false);
          setErrorMsg('');
        }
      }).catch(e => {
        if (mounted) {
          setIsError(true);
          setErrorMsg(e.message || String(e));
        }
      });
    } catch (e: any) {
      if (mounted) {
        setIsError(true);
        setErrorMsg(e.message || String(e));
      }
    }
    return () => { mounted = false; };
  }, [sanitizedChart, isTyping]);

  if (isTyping || isError || !svg) {
    return (
      <div className="bg-[#1a1b26] p-4 rounded-xl overflow-x-auto my-3 border border-white/10 shadow-inner text-[0.9em] w-full min-w-0">
        <div className="text-[var(--text-secondary)] text-xs mb-2 flex flex-col gap-2 min-w-0 w-full">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)] animate-pulse"></span>
            图表渲染中 / 源码预览...
          </div>
          {errorMsg && <div className="text-red-400 font-mono text-[10px] break-all whitespace-pre-wrap border border-red-500/20 bg-red-500/10 p-2 rounded min-w-0 w-full">{errorMsg}</div>}
        </div>
        <pre className="text-[var(--accent-cyan)] font-mono whitespace-pre-wrap break-all m-0 min-w-0 w-full">{chart}</pre>
        <div className="text-gray-500 text-[10px] mt-2">Sanitized code sent to renderer:</div>
        <pre className="text-gray-400 font-mono whitespace-pre-wrap break-all m-0 text-[10px] min-w-0 w-full">{sanitizedChart}</pre>
      </div>
    );
  }

  const handleExportImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: '#1a1b26', pixelRatio: 5 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `SIDEA_Chart_${new Date().getTime()}.png`;
      a.click();
      message.success("图表长图导出成功");
    } catch (err) {
      console.error(err);
      message.error("导出失败");
    }
  };

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: '#1a1b26', pixelRatio: 5 });
      const width = chartRef.current.offsetWidth * 5;
      const height = chartRef.current.offsetHeight * 5;
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height]
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
      pdf.save(`SIDEA_Chart_${new Date().getTime()}.pdf`);
      message.success("图表 PDF 导出成功");
    } catch (err) {
      console.error(err);
      message.error("导出失败");
    }
  };

  return (
    <>
      <div 
        className="my-5 relative group bg-[#111118]/80 p-6 rounded-xl border border-white/10 overflow-x-auto shadow-inner flex justify-center cursor-pointer transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
        onClick={() => setIsFullscreen(true)}
      >
        <div 
          ref={chartRef} 
          className="p-4 bg-transparent rounded-lg"
          dangerouslySetInnerHTML={{ __html: svg }} 
        />
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
          <button onClick={handleExportImage} className="bg-black/60 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs backdrop-blur-md font-medium border border-white/10 hover:bg-[var(--accent-cyan)]/30">
            <FileImage size={14} /> PNG
          </button>
          <button onClick={handleExportPDF} className="bg-black/60 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs backdrop-blur-md font-medium border border-white/10 hover:bg-[var(--accent-cyan)]/30">
            <FileText size={14} /> PDF
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }} className="bg-black/60 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs backdrop-blur-md font-medium border border-white/10 hover:bg-white/20">
            <Maximize2 size={14} /> 全屏
          </button>
        </div>
      </div>

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={() => setIsFullscreen(false)}>
          <div className="absolute top-6 right-6 z-[10000] flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }} 
              className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition-colors backdrop-blur-md border border-white/10 hover:border-white/30 shadow-lg"
              title="关闭预览 (Esc)"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="w-full h-full flex items-center justify-center p-4 md:p-12" onClick={(e) => e.stopPropagation()}>
            <TransformWrapper
              initialScale={1}
              minScale={0.2}
              maxScale={8}
              centerOnInit={true}
              wheel={{ step: 0.1 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <React.Fragment>
                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2 bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 shadow-2xl">
                    <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} className="p-2.5 hover:bg-white/20 rounded-full text-white transition-colors" title="放大"><ZoomIn size={18} /></button>
                    <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} className="p-2.5 hover:bg-white/20 rounded-full text-white transition-colors" title="缩小"><ZoomOut size={18} /></button>
                    <div className="w-[1px] h-5 bg-white/20 mx-1"></div>
                    <button onClick={(e) => { e.stopPropagation(); resetTransform(); }} className="p-2.5 hover:bg-white/20 rounded-full text-white transition-colors" title="自适应居中"><Maximize size={18} /></button>
                  </div>
                  
                  <TransformComponent 
                    wrapperStyle={{ width: '100%', height: '100%' }} 
                    contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div 
                      className="bg-black/80 p-12 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 max-w-[90vw] max-h-[90vh] overflow-hidden flex items-center justify-center" 
                      dangerouslySetInnerHTML={{ __html: svg }} 
                    />
                  </TransformComponent>
                </React.Fragment>
              )}
            </TransformWrapper>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
