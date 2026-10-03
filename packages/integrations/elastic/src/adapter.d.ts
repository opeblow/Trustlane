import { type AuditEventT, type ProviderHealthT } from '@autopilot/schemas';
import { buildFacets, type AuditIndex, type EventSearchFilters, type EventSearchResult } from './local-index.ts';
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
export declare class ElasticAuditIndex implements AuditIndex {
    private readonly config;
    readonly engine: "elastic";
    private mappingReady;
    constructor(config: ElasticConfig);
    private headers;
    private fetch;
    health(): Promise<ProviderHealthT>;
    private ensureMapping;
    index(event: AuditEventT): Promise<void>;
    indexMany(events: AuditEventT[]): Promise<void>;
    search(filters: EventSearchFilters): Promise<EventSearchResult>;
}
/**
 * Writes to Elasticsearch when configured, always keeps the local index in sync
 * as a read-through fallback, and reports degradation honestly if the cluster
 * becomes unreachable mid-run.
 */
export declare class ResilientAuditIndex implements AuditIndex {
    private readonly primary;
    private readonly local;
    readonly engine: 'elastic' | 'local';
    private lastError;
    constructor(primary: AuditIndex, local: AuditIndex);
    health(): Promise<ProviderHealthT>;
    index(event: AuditEventT): Promise<void>;
    indexMany(events: AuditEventT[]): Promise<void>;
    search(filters: EventSearchFilters): Promise<EventSearchResult>;
    degradation(): string | null;
}
export declare function createAuditIndex(config: {
    node?: string;
    apiKey?: string;
    index?: string;
}): AuditIndex;
export { buildFacets };
//# sourceMappingURL=adapter.d.ts.map