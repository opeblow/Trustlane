import type { ProductT } from '@autopilot/schemas';
/**
 * Bundled catalog used when Channel3 credentials are not configured.
 *
 * These records are clearly-labelled reference data shipped with the
 * repository (provider `local-catalog`), not scraped or fabricated live
 * inventory: prices are static examples and availability is a static field.
 * Every product built from this source carries `evidence.kind = 'provider_field'`
 * with source `local-catalog`, so the audit trail states exactly where a value
 * came from. Set CHANNEL3_BASE_URL/CHANNEL3_API_KEY to replace this source.
 */
export interface LocalCatalogRecord {
    externalId: string;
    title: string;
    brand: string;
    category: ProductT['category'];
    price: number;
    currency: string;
    listPrice?: number;
    availability: ProductT['availability']['status'];
    attributes: Record<string, number | string | null>;
}
export declare const LOCAL_CATALOG: LocalCatalogRecord[];
//# sourceMappingURL=local-catalog.d.ts.map