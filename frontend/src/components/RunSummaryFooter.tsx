import React from 'react';
import { Clock, Cpu, Database, Wrench, Zap, Timer, CheckCircle2 } from 'lucide-react';

export type RunSummary = {
  tools?: string[];
  tool_count?: number;
  duration_ms?: number;
  duration_sec?: number;
  model?: string;
  skill_id?: string;
  skill_name?: string;
  tokens?: { input?: number; output?: number; total?: number };
  tokens_estimated?: boolean;
  complexity?: number;
  finished_at?: number;
};

function formatDuration(ms?: number, sec?: number): string {
  const s = sec ?? (ms != null ? ms / 1000 : undefined);
  if (s == null || Number.isNaN(s)) return '—';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}m ${rem.toFixed(0)}s`;
}

function formatTokens(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function RunSummaryFooter({ summary }: { summary?: RunSummary | null }) {
  if (!summary) return null;

  const tools = summary.tools?.length ? summary.tools : [];
  const tokens = summary.tokens || {};
  const finished =
    summary.finished_at != null
      ? new Date(summary.finished_at).toLocaleTimeString()
      : undefined;

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
          <CheckCircle2 size={13} />
          已完成 {formatDuration(summary.duration_ms, summary.duration_sec)}
          {finished ? <span className="opacity-60 font-normal">· {finished}</span> : null}
          <span className="ml-1 text-[10px] border border-emerald-500/30 rounded px-1 py-0.5">DONE</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cpu size={12} className="text-[var(--accent-blue)]" />
          模型 <span className="text-[var(--text-primary)] font-mono">{summary.model || '—'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Database size={12} className="text-[var(--accent-purple)]" />
          角色 <span className="text-[var(--text-primary)]">{summary.skill_name || summary.skill_id || '—'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5" title={summary.tokens_estimated ? '模型未回传用量，按字符粗估' : '模型 usage'}>
          <Zap size={12} className="text-amber-400" />
          Token {formatTokens(tokens.total)}
          <span className="opacity-50">
            (↑{formatTokens(tokens.input)} ↓{formatTokens(tokens.output)}
            {summary.tokens_estimated ? ' ·估' : ''})
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={12} />
          复杂度 {summary.complexity?.toFixed?.(2) ?? '—'}
        </span>
      </div>

      {tools.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
          <span className="inline-flex items-center gap-1 text-[var(--accent-blue)]">
            <Wrench size={12} />
            工具 ({tools.length})
          </span>
          {tools.map((t) => (
            <span
              key={t}
              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function EtaBanner({
  etaSec,
  confidence,
  sampleSize,
  elapsedSec,
}: {
  etaSec?: number;
  confidence?: string;
  sampleSize?: number;
  elapsedSec?: number;
}) {
  if (etaSec == null) return null;
  const remaining = Math.max(0, etaSec - (elapsedSec || 0));
  const confLabel =
    confidence === 'high' ? '高置信' : confidence === 'medium' ? '中置信' : '低置信';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/5 px-3 py-2 text-xs text-[var(--accent-cyan)]">
      <span className="inline-flex items-center gap-2">
        <Timer size={13} className="animate-pulse" />
        预计约 {etaSec.toFixed(0)}s 完成
        <span className="opacity-70">
          · 已耗时 {(elapsedSec || 0).toFixed(0)}s · 剩余 ~{remaining.toFixed(0)}s
        </span>
      </span>
      <span className="opacity-60 text-[10px]">
        {confLabel}
        {sampleSize != null ? ` · 样本 ${sampleSize}` : ''}
        · 基于历史交互复杂度推断
      </span>
    </div>
  );
}
