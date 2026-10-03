import { type AvailabilityT, type CatalogSearchRequestT, type CatalogSearchResponseT, type ProductT, type ProviderHealthT } from '@autopilot/schemas';
export interface CatalogProvider {
    readonly name: string;
    health(): Promise<ProviderHealthT>;
    search(request: CatalogSearchRequestT): Promise<CatalogSearchResponseT>;
    details(productId: string): Promise<ProductT | undefined>;
}
export interface CatalogProviderConfig {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
}
/**
 * Normalise a provider payload into the internal product schema.
 *
 * Every attribute carries an evidence reference. When the provider did not
 * supply a value, the attribute is emitted with `value: null` and evidence kind
 * `unverified` so the UI is forced to show it as unknown rather than as fact.
 */
export declare function normalizeProduct(input: {
    provider: string;
    externalId: string;
    title: string;
    brand?: string;
    category?: ProductT['category'];
    price: number;
    currency: string;
    listPrice?: number;
    attributes?: Record<string, number | string | null | undefined>;
    availability?: Partial<AvailabilityT>;
    sourceUrl?: string;
    raw?: Record<string, unknown>;
    retrievedAt?: string;
}): ProductT;
/** Rank/filter helper shared by every catalog provider. */
export declare function applyCatalogFilters(products: ProductT[], request: CatalogSearchRequestT): ProductT[];
export declare function defaultQuoteAgeMinutes(): number;
//# sourceMappingURL=normalize.d.ts.map