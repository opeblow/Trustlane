import { nowIso, type AuditEventT, type ProviderHealthT } from '@autopilot/schemas';
import {
  buildFacets,
  LocalAuditIndex,
  type AuditIndex,
  type EventSearchFilters,
  type EventSearchResult,
} from './local-index.ts';

export interface ElasticConfig {
  node: string;
  apiKey?: string;
  index: string;
  timeoutMs?: number;
}

/**
 * Elasticsearch adapter written directly against the REST API so the project
 * has no heavy client dependency. Documents use the real audit-event shape, so
 * the same queries work against Elasticsearch or OpenSearch.
 */
export class ElasticAuditIndex implements AuditIndex {
  readonly engine = 'elastic' as const;
  private mappingReady: Promise<void> | null = null;

  constructor(private readonly config: ElasticConfig) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.config.apiKey ? { authorization: `ApiKey ${this.config.apiKey}` } : {}),
    };
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    try {
      return await fetch(`${this.config.node.replace(/\/$/, '')}/${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<ProviderHealthT> {
    try {
      const response = await this.fetch('_cluster/health');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { status?: string };
      return {
        provider: 'elastic',
        status: body.status === 'red' ? 'degraded' : 'live',
        detail: `Elasticsearch cluster status: ${body.status ?? 'unknown'}.`,
        checkedAt: nowIso(),
        endpoint: this.config.node,
        requiresCredentials: true,
      };
    } catch (error) {
      return {
        provider: 'elastic',
        status: 'degraded',
        detail: `Elasticsearch is configured but unreachable: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: nowIso(),
        endpoint: this.config.node,
        requiresCredentials: true,
      };
    }
  }

  private async ensureMapping(): Promise<void> {
    this.mappingReady ??= (async () => {
      const index = this.config.index;
      const exists = await this.fetch(index, { method: 'HEAD' });
      if (exists.ok) return;
      await this.fetch(index, {
        method: 'PUT',
        body: JSON.stringify({
          mappings: {
            properties: {
              id: { type: 'keyword' },
              correlationId: { type: 'keyword' },
              runId: { type: 'keyword' },
              type: { type: 'keyword' },
              severity: { type: 'keyword' },
              actor: { type: 'keyword' },
              source: { type: 'keyword' },
              timestamp: { type: 'date' },
              sequence: { type: 'integer' },
              payload: { type: 'object', enabled: false },
            },
          },
        }),
      });
    })();
    return this.mappingReady;
  }

  async index(event: AuditEventT): Promise<void> {
    await this.ensureMapping();
    const response = await this.fetch(`${this.config.index}/_doc/${event.id}?refresh=wait_for`, {
      method: 'PUT',
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(`Elasticsearch indexing failed: HTTP ${response.status}`);
    }
  }

  async indexMany(events: AuditEventT[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureMapping();
    const body = events
      .map((event) => `${JSON.stringify({ index: { _index: this.config.index, _id: event.id } })}\n${JSON.stringify(event)}`)
      .join('\n');
    const response = await this.fetch('_bulk?refresh=wait_for', {
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body,
    });
    if (!response.ok) {
      throw new Error(`Elasticsearch bulk indexing failed: HTTP ${response.status}`);
    }
  }

  async search(filters: EventSearchFilters): Promise<EventSearchResult> {
    const started = Date.now();
    const must: unknown[] = [];
    const filter: unknown[] = [];

    if (filters.correlationId) filter.push({ term: { correlationId: filters.correlationId } });
    if (filters.runId) filter.push({ term: { runId: filters.runId } });
    if (filters.types?.length) filter.push({ terms: { type: filters.types } });
    if (filters.severities?.length) filter.push({ terms: { severity: filters.severities } });
    if (filters.since || filters.until) {
      filter.push({
        range: { timestamp: { ...(filters.since ? { gte: filters.since } : {}), ...(filters.until ? { lte: filters.until } : {}) } },
      });
    }
    if (filters.q) {
      must.push({
        multi_match: {
          query: filters.q,
          fields: ['type', 'actor', 'source', 'correlationId', 'runId'],
          fuzziness: 'AUTO',
        },
      });
    }

    const response = await this.fetch(`${this.config.index}/_search`, {
      method: 'POST',
      body: JSON.stringify({
        size: filters.limit ?? 50,
        from: filters.offset ?? 0,
        sort: [{ timestamp: 'desc' }, { sequence: 'desc' }],
        query: { bool: { ...(must.length ? { must } : {}), ...(filter.length ? { filter } : {}) } },
        aggs: {
          by_type: { terms: { field: 'type', size: 50 } },
          by_severity: { terms: { field: 'severity', size: 5 } },
        },
      }),
    });

    if (!response.ok) throw new Error(`Elasticsearch search failed: HTTP ${response.status}`);
    const body = (await response.json()) as {
      hits?: { total?: { value?: number } | number; hits?: Array<{ _source: AuditEventT }> };
      aggregations?: {
        by_type?: { buckets?: Array<{ key: string; doc_count: number }> };
        by_severity?: { buckets?: Array<{ key: string; doc_count: number }> };
      };
    };

    const events = (body.hits?.hits ?? []).map((hit) => hit._source);
    const aggs = body.aggregations;
    return {
      total:
        typeof body.hits?.total === 'number' ? body.hits.total : (body.hits?.total?.value ?? events.length),
      tookMs: Date.now() - started,
      engine: 'elastic',
      facets: {
        types: (aggs?.by_type?.buckets ?? []).map((b) => ({ key: b.key, count: b.doc_count })),
        severities: (aggs?.by_severity?.buckets ?? []).map((b) => ({ key: b.key, count: b.doc_count })),
      },
      events,
    };
  }
}

/**
 * Writes to Elasticsearch when configured, always keeps the local index in sync
 * as a read-through fallback, and reports degradation honestly if the cluster
 * becomes unreachable mid-run.
 */
export class ResilientAuditIndex implements AuditIndex {
  readonly engine: 'elastic' | 'local';
  private lastError: string | null = null;

  constructor(
    private readonly primary: AuditIndex,
    private readonly local: AuditIndex,
  ) {
    this.engine = primary.engine;
  }

  async health(): Promise<ProviderHealthT> {
    return this.primary.health();
  }

  async index(event: AuditEventT): Promise<void> {
    await this.local.index(event);
    try {
      await this.primary.index(event);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  async indexMany(events: AuditEventT[]): Promise<void> {
    await this.local.indexMany(events);
    try {
      await this.primary.indexMany(events);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  async search(filters: EventSearchFilters): Promise<EventSearchResult> {
    try {
      const result = await this.primary.search(filters);
      this.lastError = null;
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const fallback = await this.local.search(filters);
      return {
        ...fallback,
        degradedReason: `Elasticsearch query failed (${reason}); served from the local audit index.`,
      };
    }
  }

  degradation(): string | null {
    return this.lastError;
  }
}

export function createAuditIndex(config: {
  node?: string;
  apiKey?: string;
  index?: string;
}): AuditIndex {
  const local = new LocalAuditIndex();
  if (config.node) {
    return new ResilientAuditIndex(
      new ElasticAuditIndex({
        node: config.node,
        apiKey: config.apiKey,
        index: config.index ?? 'autopilot-events',
      }),
      local,
    );
  }
  return local;
}

export { buildFacets };