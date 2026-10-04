import type {
  AuditEventT,
  CreateIntentResponseT,
  HealthResponseT,
  ListPoliciesResponseT,
  ListRunsResponseT,
  RunDetailResponseT,
  RunResponseT,
} from '@autopilot/schemas';

/**
 * Render (and most PaaS secret managers) hand over a bare hostname such as
 * `trustlane-api.onrender.com`. Left alone that becomes a relative URL and the
 * browser silently calls the wrong origin, so the scheme is restored here.
 */
export function normaliseApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

export const API_BASE = normaliseApiBase(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const text = await response.text();
  const body = text ? safeJson(text) : undefined;
  if (!response.ok) {
    throw toApiError(response, body);
  }
  return body as T;
}

/** The API reports failures as `{ error: { code, message, details } }`, but plain
 *  string bodies and `{ message }` payloads also occur behind proxies. */
function toApiError(response: Response, body: unknown): ApiError {
  const fallback = `${response.status} ${response.statusText}`.trim();
  if (typeof body === 'string' && body.length > 0) return new ApiError(response.status, body);
  const envelope = (body ?? {}) as {
    message?: string;
    code?: string;
    details?: unknown;
    error?: string | { code?: string; message?: string; details?: unknown };
  };
  if (typeof envelope.error === 'string') return new ApiError(response.status, envelope.error, envelope.code, envelope.details);
  const nested = typeof envelope.error === 'object' ? envelope.error : undefined;
  const code = nested?.code ?? envelope.code;
  const message = nested?.message ?? envelope.message;
  const details = nested?.details ?? envelope.details;
  return new ApiError(response.status, message ?? fallback, code, details);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface EventSearchResponse {
  total: number;
  tookMs: number;
  engine: string;
  degradedReason?: string;
  facets?: Record<string, unknown>;
  events: AuditEventT[];
}

export const api = {
  health: () => request<HealthResponseT>('/api/health'),
  runs: (limit = 50) => request<ListRunsResponseT>(`/api/runs?limit=${limit}`),
  run: (runId: string) => request<RunDetailResponseT>(`/api/runs/${runId}`),
  events: (limit = 60) => request<EventSearchResponse>(`/api/events?limit=${limit}`),
  policies: () => request<ListPoliciesResponseT>('/api/policies'),
  createIntent: (text: string, currency?: string) =>
    request<CreateIntentResponseT>('/api/intents', {
      method: 'POST',
      body: JSON.stringify({ text, ...(currency ? { currency } : {}) }),
    }),
  startRun: (intentId: string) =>
    request<RunResponseT>('/api/runs', { method: 'POST', body: JSON.stringify({ intentId }) }),
  updateIntentConstraints: (intentId: string, numeric: unknown[]) =>
    request<{ intent: unknown }>(`/api/intents/${intentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ numeric }),
    }),
};

/** Human-readable failure text that keeps the machine-readable API code. */
export function describeError(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof ApiError) {
    return error.code ? `${error.code} · ${error.message}` : error.message;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** Resolves relative times against a stable "now" so hydration cannot mismatch. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

export function clockTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toISOString().slice(11, 19);
}

export function dateTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return `${new Date(parsed).toISOString().slice(0, 10)} ${new Date(parsed).toISOString().slice(11, 16)}`;
}

export function money(amount: number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function titleCase(value: string): string {
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export type StatusTone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral' | 'live';

const STATUS_TONES: Record<string, StatusTone> = {
  completed: 'ok',
  done: 'ok',
  verified: 'ok',
  approved: 'ok',
  captured: 'ok',
  allowed: 'ok',
  allow: 'ok',
  succeeded: 'ok',
  running: 'live',
  queued: 'live',
  pending: 'live',
  awaiting_approval: 'warn',
  requires_approval: 'warn',
  degraded: 'warn',
  evidence_gap_detected: 'warn',
  unverified: 'warn',
  blocked: 'bad',
  failed: 'bad',
  tampered: 'bad',
  denied: 'bad',
  deny: 'bad',
  cancelled: 'neutral',
  error: 'bad',
  unknown: 'neutral',
  unavailable: 'bad',
  in_stock: 'ok',
  low_stock: 'warn',
  out_of_stock: 'bad',
  preorder: 'info',
  backorder: 'info',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_TONES[status.toLowerCase()] ?? 'neutral';
}

export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return '—';
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}