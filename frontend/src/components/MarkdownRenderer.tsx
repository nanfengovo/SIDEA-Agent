import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { v4 as uuidv4 } from 'uuid';
import ReactECharts from 'echarts-for-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Maximize2, X, ZoomIn, ZoomOut, Maximize, Download, FileImage, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { message, Image } from 'antd';
import { getBaseUrl } from '../config';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

interface MarkdownRendererProps {
  content: string;
  isTyping?: boolean;
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

const MarkdownRenderer = React.memo(({ content, isTyping }: MarkdownRendererProps) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const components = React.useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && lang === 'mermaid') {
        return <MermaidChart chart={codeString} isTyping={isTyping} />;
      }

      if (!inline && (lang === 'echarts' || lang === 'json')) {
        try {
          const option = JSON.parse(codeString);
          if (option.series || option.xAxis) {
            return <ReactECharts option={option} style={{ height: '350px', width: '100%' }} theme="dark" />;
          }
        } catch (e) {}
      }

      const isFileName = /\.(png|jpg|jpeg|gif|csv|xlsx|txt)$/i.test(codeString.trim()) && !codeString.includes('\n');

      if (isFileName) {
        return (
          <code 
            className={`inline-block bg-[#1a1b26] px-1.5 py-0.5 rounded text-[0.9em] font-mono border border-white/5 text-[var(--accent-purple)] cursor-pointer hover:bg-white/10 hover:shadow-[0_0_10px_var(--accent-purple)] transition-all underline decoration-dashed underline-offset-4`}
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
        <div className="bg-[#1a1b26] p-4 rounded-xl overflow-x-auto my-3 border border-white/10 shadow-inner text-[0.9em]">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      ) : (
        <code className="bg-[#1a1b26] px-1.5 py-0.5 rounded text-[0.9em] text-[var(--accent-cyan)] font-mono border border-white/5" {...props}>
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
  }), [isTyping]);

  return (
    <>
      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {content}
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
