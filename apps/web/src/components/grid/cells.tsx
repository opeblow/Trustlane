'use client';

import type { CustomCellRendererProps } from 'ag-grid-react';

import {
  clockTime,
  duration,
  money,
  pct,
  relativeTime,
  shortId,
  statusTone,
  titleCase,
  type StatusTone,
} from '@/lib/api';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'ok',
  bad: 'bad',
  warn: 'warn',
  info: 'info',
  live: 'running',
  neutral: '',
};

export interface AttributeRow {
  attributes?: Record<string, number | string | boolean | null>;
  evidence?: Record<string, 'verified' | 'unverified'>;
  unverifiedCount?: number;
  tradeoffs?: { pro: number; con: number };
  currency?: string;
  engine?: { name?: string; model?: string; usedLlm?: boolean };
}

export function StatusPillCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  const tone = statusTone(value);
  return (
    <span className={`pill ${TONE_CLASS[tone]}`.trim()} title={String(value)}>
      {titleCase(String(value))}
    </span>
  );
}

export function SeverityCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  const tone: StatusTone = value === 'error' ? 'bad' : value === 'warn' ? 'warn' : 'info';
  return <span className={`pill ${TONE_CLASS[tone]}`}>{titleCase(String(value))}</span>;
}

export function MonoCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  return (
    <span className="cell-run-id" title={String(value)}>
      {String(value)}
    </span>
  );
}

export function ShortIdCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  return (
    <span className="cell-run-id" title={value ? String(value) : undefined}>
      {shortId(value ? String(value) : null)}
    </span>
  );
}

export function RankCell({ value }: CustomCellRendererProps<unknown, number | null>) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="rank none">—</span>;
  }
  return <span className={`rank${value <= 1 ? ' top' : ''}`}>{value}</span>;
}

export function ScoreBarCell({ value }: CustomCellRendererProps<unknown, number | null>) {
  const score = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
  const band = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  return (
    <span className="score" title={`${score.toFixed(1)} / 100`}>
      <span className="score-track">
        <span className={`score-fill ${band}`} style={{ width: `${score}%` }} />
      </span>
      <span className="score-value">{Math.round(score)}</span>
    </span>
  );
}

export function ProgressCell({ value }: CustomCellRendererProps<unknown, number | null>) {
  const progress = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <span className="score" title={`${pct(progress)} complete`}>
      <span className="score-track">
        <span className="score-fill" style={{ width: `${progress * 100}%` }} />
      </span>
      <span className="score-value">{Math.round(progress * 100)}%</span>
    </span>
  );
}

export function EvidenceChipCell({ data }: CustomCellRendererProps<AttributeRow, number | null>) {
  const gaps = data?.unverifiedCount ?? 0;
  return (
    <span className={`evidence-chip ${gaps > 0 ? 'gaps' : 'clean'}`} title={`${gaps} unverified field(s)`}>
      {gaps > 0 ? `${gaps} unverified` : 'All verified'}
    </span>
  );
}

export function TradeoffCell({ data }: CustomCellRendererProps<AttributeRow>) {
  const pro = data?.tradeoffs?.pro ?? 0;
  const con = data?.tradeoffs?.con ?? 0;
  return (
    <span className="tradeoffs" title={`${pro} pros · ${con} cons`}>
      <span className="pro">+{pro}</span>
      <span className="con">−{con}</span>
    </span>
  );
}

/** Attribute cells carry their own evidence state, mirroring the "never present as fact" rule. */
export function AttributeCell({
  value,
  data,
  colDef,
}: CustomCellRendererProps<AttributeRow, number | string | boolean | null>) {
  const key = String(colDef?.colId ?? '');
  const verified = data?.evidence?.[key] !== 'unverified';
  if (value === null || value === undefined || value === '') {
    return (
      <span className="attr" title={`${key}: no verified value`}>
        <span className="attr-value attr-empty">—</span>
        <span className="attr-flag" />
      </span>
    );
  }
  return (
    <span className="attr" title={`${key}: ${verified ? 'verified' : 'unverified'}`}>
      <span className={`attr-value${verified ? '' : ' unverified'}`}>{String(value)}</span>
      {!verified && <span className="attr-flag" />}
    </span>
  );
}

export function MoneyCell({ value, data }: CustomCellRendererProps<AttributeRow, number | null>) {
  return <span className="attr-value">{money(value ?? null, data?.currency ?? 'USD')}</span>;
}

export function RelativeTimeCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  return (
    <span className="cell-nowrap" title={String(value)}>
      {relativeTime(String(value))}
    </span>
  );
}

export function ClockCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  return (
    <span className="cell-nowrap" title={String(value)}>
      {clockTime(String(value))}
    </span>
  );
}

export function DurationCell({ value }: CustomCellRendererProps<unknown, number | null>) {
  if (typeof value !== 'number') return <span className="cell-muted">—</span>;
  return (
    <span className={`duration${value > 1000 ? ' slow' : ''}`} title={`${value}ms`}>
      {duration(value)}
    </span>
  );
}

export function WrapCell({ value }: CustomCellRendererProps<unknown, string | null>) {
  if (!value) return <span className="cell-muted">—</span>;
  return <span className="cell-wrap">{String(value)}</span>;
}

/** Surfaces which engine answered — deterministic validation always runs afterwards. */
export function EngineCell({ data }: CustomCellRendererProps<AttributeRow>) {
  const engine = data?.engine;
  if (!engine) return <span className="cell-muted">—</span>;
  if (!engine.usedLlm) return <span className="pill">Deterministic</span>;
  return (
    <span className="pill info" title={engine.model ? `Model: ${engine.model}` : 'LLM assisted'}>
      {engine.model ?? 'LLM'}
    </span>
  );
}