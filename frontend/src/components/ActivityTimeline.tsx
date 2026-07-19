import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Wrench,
  PenLine,
  Check,
  X as XIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 单个活动步骤（思考 / 调用工具 / 输出回复） */
export interface Activity {
  id: string;
  kind: 'thinking' | 'tool' | 'responding';
  /** 工具名等附加信息 */
  name?: string;
  startTs: number;
  endTs?: number;
  status: 'running' | 'done' | 'error';
  /** 错误摘要 */
  detail?: string;
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/** 实时计时器：运行中每秒刷新 */
function LiveDuration({ startTs }: { startTs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono tabular-nums">{fmtDur(Date.now() - startTs)}</span>;
}

function kindIcon(a: Activity) {
  const cls = 'w-3.5 h-3.5';
  if (a.kind === 'thinking') return <Brain className={cls} />;
  if (a.kind === 'tool') return <Wrench className={cls} />;
  return <PenLine className={cls} />;
}

function ActivityRow({ a }: { a: Activity }) {
  const { t } = useTranslation();
  const label =
    a.kind === 'thinking'
      ? t('act_thinking')
      : a.kind === 'responding'
        ? t('act_responding')
        : `${t('act_tool')} ${a.name || ''}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 text-xs py-1"
    >
      {/* 状态图标 */}
      {a.status === 'running' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-cyan)]" />
      ) : a.status === 'error' ? (
        <XIcon className="w-3.5 h-3.5 text-red-400" />
      ) : (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      )}

      <span
        className={`flex items-center gap-1.5 ${
          a.status === 'running'
            ? 'text-[var(--text-primary)] animate-pulse'
            : a.status === 'error'
              ? 'text-red-400'
              : 'text-[var(--text-secondary)]'
        }`}
      >
        {kindIcon(a)}
        <span className={a.kind === 'tool' ? 'font-mono' : ''}>{label}</span>
      </span>

      <span className="text-[var(--text-secondary)]/70 ml-auto">
        {a.status === 'running' ? (
          <LiveDuration startTs={a.startTs} />
        ) : (
          <span className="font-mono tabular-nums">{fmtDur((a.endTs || a.startTs) - a.startTs)}</span>
        )}
      </span>

      {a.status === 'error' && a.detail && (
        <span className="text-red-400/70 truncate max-w-[220px]" title={a.detail}>
          {a.detail}
        </span>
      )}
    </motion.div>
  );
}

interface ActivityTimelineProps {
  activities: Activity[];
  /** 整体是否仍在运行 */
  running: boolean;
  /** 若有 run_summary，强制显示为已完成（比 running 更权威） */
  forcedDone?: boolean;
}

/**
 * Cursor 风格的执行活动时间线：
 * - 运行中：展开显示每一步（思考/工具/输出），当前步带旋转动画和实时计时。
 * - 结束后：折叠成一行 "已完成 · 用时 Xs · N 步"，点击可展开回看。
 */
export default function ActivityTimeline({ activities, running, forcedDone }: ActivityTimelineProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!activities.length) return null;

  // 权威完成信号优先：有 run_summary 或父级声明结束时，绝不再显示"正在工作"
  const isRunning = running && !forcedDone;
  const displayActs: Activity[] = isRunning
    ? activities
    : activities.map((a) =>
        a.status === 'running' ? { ...a, status: 'done' as const, endTs: a.endTs || Date.now() } : a,
      );

  const startTs = displayActs[0].startTs;
  const endTs = Math.max(...displayActs.map((a) => a.endTs || a.startTs));
  const hasError = displayActs.some((a) => a.status === 'error');
  const toolCount = displayActs.filter((a) => a.kind === 'tool').length;
  const showList = isRunning || expanded;

  return (
    <div
      className={`mb-2 rounded-lg border overflow-hidden ${
        isRunning
          ? 'border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5'
          : hasError
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-emerald-500/30 bg-emerald-500/5'
      }`}
    >
      {/* 汇总行 — 一眼看懂进行中/已完成 */}
      <button
        type="button"
        onClick={() => !isRunning && setExpanded((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
          isRunning ? 'cursor-default' : 'hover:bg-white/5 cursor-pointer'
        }`}
      >
        {isRunning ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-cyan)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-cyan)]"></span>
            </span>
            <span className="text-[var(--accent-cyan)] font-semibold tracking-wide">{t('act_working')}</span>
            <span className="text-[var(--text-secondary)] font-mono tabular-nums">
              <LiveDuration startTs={startTs} />
            </span>
            <span className="ml-auto text-[10px] text-[var(--accent-cyan)]/80 border border-[var(--accent-cyan)]/30 rounded px-1.5 py-0.5">
              IN PROGRESS
            </span>
          </>
        ) : (
          <>
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            )}
            {hasError ? (
              <XIcon className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className={`font-semibold tracking-wide ${hasError ? 'text-red-400' : 'text-emerald-400'}`}>
              {hasError ? t('act_finished_with_error') : t('act_done')}
            </span>
            <span className="text-[var(--text-secondary)]/80 font-mono tabular-nums">
              {t('act_worked_for')} {fmtDur(endTs - startTs)}
            </span>
            {toolCount > 0 && (
              <span className="text-[var(--text-secondary)]/60">
                · {toolCount} {t('act_tool_calls')}
              </span>
            )}
            <span
              className={`ml-auto text-[10px] rounded px-1.5 py-0.5 border ${
                hasError
                  ? 'text-red-400 border-red-500/30'
                  : 'text-emerald-400 border-emerald-500/30'
              }`}
            >
              {hasError ? 'ERROR' : 'DONE'}
            </span>
          </>
        )}
      </button>

      {/* 步骤列表 */}
      <AnimatePresence initial={false}>
        {showList && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-[var(--border-color)]/50"
          >
            <div className="px-3 py-1">
              {displayActs.map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
