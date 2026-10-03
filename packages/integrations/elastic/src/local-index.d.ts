import { type AuditEventT, type ProviderHealthT, type SeverityT } from '@autopilot/schemas';
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
        types: Array<{
            key: string;
            count: number;
        }>;
        severities: Array<{
            key: string;
            count: number;
        }>;
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
export declare class LocalAuditIndex implements AuditIndex {
    readonly engine: "local";
    private readonly events;
    health(): Promise<ProviderHealthT>;
    index(event: AuditEventT): Promise<void>;
    indexMany(events: AuditEventT[]): Promise<void>;
    search(filters: EventSearchFilters): Promise<EventSearchResult>;
    all(): AuditEventT[];
}
export declare function buildFacets(events: AuditEventT[]): EventSearchResult['facets'];
//# sourceMappingURL=local-index.d.ts.map