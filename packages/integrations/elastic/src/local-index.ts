import {
  nowIso,
  type AuditEventT,
  type ProviderHealthT,
  type SeverityT,
} from '@autopilot/schemas';

export interface EventSearchFilters {
  q?: string;
  types?: string[];
  severities?: SeverityT[];
  correlationId?: string;
  runId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface EventSearchResult {
  total: number;
  tookMs: number;
  engine: 'elastic' | 'local';
  degradedReason?: string;
  facets: {
    types: Array<{ key: string; count: number }>;
    severities: Array<{ key: string; count: number }>;
  };
  events: AuditEventT[];
}

export interface AuditIndex {
  readonly engine: 'elastic' | 'local';
  health(): Promise<ProviderHealthT>;
  index(event: AuditEventT): Promise<void>;
  indexMany(events: AuditEventT[]): Promise<void>;
  search(filters: EventSearchFilters): Promise<EventSearchResult>;
}

/**
 * In-process inverted index used when no Elasticsearch cluster is configured.
 * It supports the same query surface the Activity screen needs (free text,
 * type/severity filters, correlation/run scoping, facets) so the product is
 * fully functional without a cluster, and it is clearly labelled `local`.
 */
export class LocalAuditIndex implements AuditIndex {
  readonly engine = 'local' as const;
  private readonly events: AuditEventT[] = [];

  async health(): Promise<ProviderHealthT> {
    return {
      provider: 'elastic',
      status: 'simulated',
      detail: `ELASTIC_NODE is not configured; using the in-process audit index (${this.events.length} events). Search works; nothing is written to an Elasticsearch cluster.`,
      checkedAt: nowIso(),
      requiresCredentials: true,
    };
  }

  async index(event: AuditEventT): Promise<void> {
    this.events.push(event);
  }

  async indexMany(events: AuditEventT[]): Promise<void> {
    this.events.push(...events);
  }

  async search(filters: EventSearchFilters): Promise<EventSearchResult> {
    const started = Date.now();
    const filtered = this.events.filter((event) => matches(event, filters));
    const sorted = [...filtered].sort((a, b) =>
      b.timestamp === a.timestamp ? b.sequence - a.sequence : b.timestamp.localeCompare(a.timestamp),
    );
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;

    return {
      total: filtered.length,
      tookMs: Date.now() - started,
      engine: 'local',
      facets: buildFacets(filtered),
      events: sorted.slice(offset, offset + limit),
    };
  }

  all(): AuditEventT[] {
    return [...this.events];
  }
}

function matches(event: AuditEventT, filters: EventSearchFilters): boolean {
  if (filters.correlationId && event.correlationId !== filters.correlationId) return false;
  if (filters.runId && event.runId !== filters.runId) return false;
  if (filters.types?.length && !filters.types.includes(event.type)) return false;
  if (filters.severities?.length && !filters.severities.includes(event.severity)) return false;
  if (filters.since && event.timestamp < filters.since) return false;
  if (filters.until && event.timestamp > filters.until) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      event.type,
      event.actor,
      event.source,
      event.correlationId,
      event.runId ?? '',
      ...Object.entries(event.payload).flatMap(([k, v]) => [k, stringify(v)]),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function buildFacets(events: AuditEventT[]): EventSearchResult['facets'] {
  const types = new Map<string, number>();
  const severities = new Map<string, number>();
  for (const event of events) {
    types.set(event.type, (types.get(event.type) ?? 0) + 1);
    severities.set(event.severity, (severities.get(event.severity) ?? 0) + 1);
  }
  return {
    types: [...types.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    severities: [...severities.entries()].map(([key, count]) => ({ key, count })),
  };
}