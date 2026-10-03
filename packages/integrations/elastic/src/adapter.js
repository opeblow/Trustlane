import { nowIso } from '@autopilot/schemas';
import { buildFacets } from "./local-index.js";
/**
 * Elasticsearch adapter written directly against the REST API so the project
 * has no heavy client dependency. Documents use the real audit-event shape, so
 * the same queries work against Elasticsearch or OpenSearch.
 */
export class ElasticAuditIndex {
    config;
    engine = 'elastic';
    mappingReady = null;
    constructor(config) {
        this.config = config;
    }
    headers() {
        return {
            'content-type': 'application/json',
            ...(this.config.apiKey ? { authorization: `ApiKey ${this.config.apiKey}` } : {}),
        };
    }
    async fetch(path, init = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
        try {
            return await fetch(`${this.config.node.replace(/\/$/, '')}/${path}`, {
                ...init,
                headers: { ...this.headers(), ...(init.headers ?? {}) },
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
    }
    async health() {
        try {
            const response = await this.fetch('_cluster/health');
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const body = (await response.json());
            return {
                provider: 'elastic',
                status: body.status === 'red' ? 'degraded' : 'live',
                detail: `Elasticsearch cluster status: ${body.status ?? 'unknown'}.`,
                checkedAt: nowIso(),
                endpoint: this.config.node,
                requiresCredentials: true,
            };
        }
        catch (error) {
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
    async ensureMapping() {
        this.mappingReady ??= (async () => {
            const index = this.config.index;
            const exists = await this.fetch(index, { method: 'HEAD' });
            if (exists.ok)
                return;
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
    async index(event) {
        await this.ensureMapping();
        const response = await this.fetch(`${this.config.index}/_doc/${event.id}?refresh=wait_for`, {
            method: 'PUT',
            body: JSON.stringify(event),
        });
        if (!response.ok) {
            throw new Error(`Elasticsearch indexing failed: HTTP ${response.status}`);
        }
    }
    async indexMany(events) {
        if (events.length === 0)
            return;
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
    async search(filters) {
        const started = Date.now();
        const must = [];
        const filter = [];
        if (filters.correlationId)
            filter.push({ term: { correlationId: filters.correlationId } });
        if (filters.runId)
            filter.push({ term: { runId: filters.runId } });
        if (filters.types?.length)
            filter.push({ terms: { type: filters.types } });
        if (filters.severities?.length)
            filter.push({ terms: { severity: filters.severities } });
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
        if (!response.ok)
            throw new Error(`Elasticsearch search failed: HTTP ${response.status}`);
        const body = (await response.json());
        const events = (body.hits?.hits ?? []).map((hit) => hit._source);
        const aggs = body.aggregations;
        return {
            total: typeof body.hits?.total === 'number' ? body.hits.total : (body.hits?.total?.value ?? events.length),
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
export class ResilientAuditIndex {
    primary;
    local;
    engine = this.primary.engine;
    lastError = null;
    constructor(primary, local) {
        this.primary = primary;
        this.local = local;
    }
    async health() {
        return this.primary.health();
    }
    async index(event) {
        await this.local.index(event);
        try {
            await this.primary.index(event);
            this.lastError = null;
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
        }
    }
    async indexMany(events) {
        await this.local.indexMany(events);
        try {
            await this.primary.indexMany(events);
            this.lastError = null;
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
        }
    }
    async search(filters) {
        try {
            const result = await this.primary.search(filters);
            this.lastError = null;
            return result;
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            const fallback = await this.local.search(filters);
            return {
                ...fallback,
                degradedReason: `Elasticsearch query failed (${reason}); served from the local audit index.`,
            };
        }
    }
    degradation() {
        return this.lastError;
    }
}
export function createAuditIndex(config) {
    const local = new LocalAuditIndex();
    if (config.node) {
        return new ResilientAuditIndex(new ElasticAuditIndex({
            node: config.node,
            apiKey: config.apiKey,
            index: config.index ?? 'autopilot-events',
        }), local);
    }
    return local;
}
export { buildFacets };
//# sourceMappingURL=adapter.js.map