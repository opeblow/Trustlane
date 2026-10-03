import { nowIso, } from '@autopilot/schemas';
/**
 * In-process inverted index used when no Elasticsearch cluster is configured.
 * It supports the same query surface the Activity screen needs (free text,
 * type/severity filters, correlation/run scoping, facets) so the product is
 * fully functional without a cluster, and it is clearly labelled `local`.
 */
export class LocalAuditIndex {
    engine = 'local';
    events = [];
    async health() {
        return {
            provider: 'elastic',
            status: 'simulated',
            detail: `ELASTIC_NODE is not configured; using the in-process audit index (${this.events.length} events). Search works; nothing is written to an Elasticsearch cluster.`,
            checkedAt: nowIso(),
            requiresCredentials: true,
        };
    }
    async index(event) {
        this.events.push(event);
    }
    async indexMany(events) {
        this.events.push(...events);
    }
    async search(filters) {
        const started = Date.now();
        const filtered = this.events.filter((event) => matches(event, filters));
        const sorted = [...filtered].sort((a, b) => b.timestamp === a.timestamp ? b.sequence - a.sequence : b.timestamp.localeCompare(a.timestamp));
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
    all() {
        return [...this.events];
    }
}
function matches(event, filters) {
    if (filters.correlationId && event.correlationId !== filters.correlationId)
        return false;
    if (filters.runId && event.runId !== filters.runId)
        return false;
    if (filters.types?.length && !filters.types.includes(event.type))
        return false;
    if (filters.severities?.length && !filters.severities.includes(event.severity))
        return false;
    if (filters.since && event.timestamp < filters.since)
        return false;
    if (filters.until && event.timestamp > filters.until)
        return false;
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
        if (!haystack.includes(needle))
            return false;
    }
    return true;
}
function stringify(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object')
        return JSON.stringify(value);
    return String(value);
}
export function buildFacets(events) {
    const types = new Map();
    const severities = new Map();
    for (const event of events) {
        types.set(event.type, (types.get(event.type) ?? 0) + 1);
        severities.set(event.severity, (severities.get(event.severity) ?? 0) + 1);
    }
    return {
        types: [...types.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
        severities: [...severities.entries()].map(([key, count]) => ({ key, count })),
    };
}
//# sourceMappingURL=local-index.js.map