import { type CatalogSearchRequestT, type CatalogSearchResponseT, type ProductT, type ProviderHealthT } from '@autopilot/schemas';
import { type CatalogProvider } from './normalize.ts';
export declare const LOCAL_CATALOG_PROVIDER = "local-catalog";
/**
 * Reference catalog shipped with the repository. Used when Channel3 credentials
 * are absent so that discovery, evaluation and the whole governed flow remain
 * runnable. It is explicitly labelled as bundled reference data everywhere it
 * surfaces (provider name, audit events and the Settings screen).
 */
export declare class LocalCatalogProvider implements CatalogProvider {
    readonly name = "local-catalog";
    private readonly products;
    constructor(records?: import("./local-catalog.ts").LocalCatalogRecord[]);
    health(): Promise<ProviderHealthT>;
    search(request: CatalogSearchRequestT): Promise<CatalogSearchResponseT>;
    details(productId: string): Promise<ProductT | undefined>;
    all(): ProductT[];
}
/**
 * Channel3 adapter. Channel3 exposes no public, documented catalog API that can
 * be called without a hackathon grant, so this adapter talks to a configurable
 * JSON endpoint and maps its payload into the internal schema. Configure
 * CHANNEL3_BASE_URL (+ optional CHANNEL3_API_KEY) to point it at the real
 * service; until then the API reports the provider as unconfigured instead of
 * inventing results.
 */
export declare class Channel3Provider implements CatalogProvider {
    private readonly config;
    readonly name = "channel3";
    constructor(config: {
        baseUrl: string;
        apiKey?: string;
        timeoutMs?: number;
    });
    health(): Promise<ProviderHealthT>;
    search(request: CatalogSearchRequestT): Promise<CatalogSearchResponseT>;
    details(productId: string): Promise<ProductT | undefined>;
    private toProduct;
    private fetchJson;
}
export interface CatalogStack {
    primary: CatalogProvider;
    fallback?: CatalogProvider;
    /** Human-readable description of what is really running. */
    description: string;
}
export declare function createCatalogStack(config: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
}): CatalogStack;
/**
 * Search with an explicit, honest fallback: if the configured provider fails we
 * either use the documented substitute or report failure. We never silently
 * return the substitute as if it were live.
 */
export declare function searchWithFallback(stack: CatalogStack, request: CatalogSearchRequestT): Promise<CatalogSearchResponseT>;
export declare function quoteTimestamp(): string;
//# sourceMappingURL=provider.d.ts.map