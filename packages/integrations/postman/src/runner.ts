import { buildCollection, resolvePointer } from './collection.ts';
import { GOLDEN_PATH } from './collection.ts';

export interface RunnerOptions {
  baseUrl: string;
  onlyGoldenPath?: boolean;
  timeoutMs?: number;
  onResult?: (result: RequestResult) => void;
}

export interface RequestResult {
  operationId: string;
  name: string;
  url: string;
  method: string;
  status: number;
  ok: boolean;
  expected: number;
  durationMs: number;
  error?: string;
  body?: unknown;
}

interface CollectionItem {
  name: string;
  'x-autopilot': {
    operationId: string;
    goldenPath: boolean;
    expectStatus: number;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

function substituteDeep<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return substitute(value, vars) as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => substituteDeep(entry, vars)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = substituteDeep(entry, vars);
    }
    return out as unknown as T;
  }
  return value;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  results: RequestResult[];
  variables: Record<string, string>;
}

/**
 * Executes the generated collection against a running API.
 *
 * The collection is the single source of truth, so this doubles as the
 * contract test: if a documented route is missing, or stops returning the
 * documented status, the Golden Path fails.
 */
export async function runCollection(options: RunnerOptions): Promise<RunSummary> {
  const collection = buildCollection({ baseUrl: options.baseUrl }) as {
    item: Array<CollectionItem & { request: { method: string; url: { raw: string } } }>;
  };
  const variables: Record<string, string> = { baseUrl: options.baseUrl.replace(/\/$/, '') };
  const results: RequestResult[] = [];

  const items = collection.item.filter((item) => (options.onlyGoldenPath ? GOLDEN_PATH.includes(item['x-autopilot'].operationId) : true));

  for (const item of items) {
    const meta = item['x-autopilot'];
    const url = substituteDeep(item.request.url.raw, variables) as unknown as string;
    const method = item.request.method.toUpperCase();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

    let status = 0;
    let body: unknown;
    let error: string | undefined;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(meta.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...substituteDeep(meta.headers ?? {}, variables),
        },
        ...(meta.body !== undefined ? { body: JSON.stringify(substituteDeep(meta.body, variables)) } : {}),
        signal: controller.signal,
      });
      status = response.status;
      const text = await response.text();
      body = text ? safeParse(text) : undefined;
      const json = body as Record<string, unknown> | undefined;
      if (json && typeof json === 'object' && typeof json.correlationId === 'string' && !variables.correlationId) {
        variables.correlationId = json.correlationId;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      clearTimeout(timer);
    }

    const ok = status === meta.expectStatus;
    const result: RequestResult = {
      operationId: meta.operationId,
      name: item.name,
      url,
      method,
      status,
      ok,
      expected: meta.expectStatus,
      durationMs: Date.now() - started,
      ...(error ? { error } : {}),
      body,
    };
    results.push(result);
    options.onResult?.(result);

    if (!ok && meta.goldenPath) {
      break;
    }
  }

  return {
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
    variables,
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatSummary(summary: RunSummary): string {
  const lines = summary.results.map((result) => {
    const mark = result.ok ? 'PASS' : 'FAIL';
    const detail = result.ok ? `${result.status}` : `${result.status} (expected ${result.expected})`;
    return `${mark}  ${result.operationId.padEnd(22)} ${detail.padEnd(10)} ${result.url}${result.error ? ` error=${result.error}` : ''}`;
  });
  lines.push(`--- ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  return lines.join('\n');
}

export function captureFromBody(body: unknown, pointer: string): string | undefined {
  const value = resolvePointer(body, pointer);
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}