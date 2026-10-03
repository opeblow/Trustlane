import { z } from 'zod';
import { IsoDateTime } from "./common.js";
import { CurrencyCode, Money } from "./money.js";
export const EvidenceKind = z.enum([
    'provider_field',
    'provider_page',
    'computed',
    'user_statement',
    'unverified',
]);
export const EvidenceRef = z.object({
    kind: EvidenceKind,
    /** Provider or subsystem that produced the value (e.g. 'channel3', 'local-catalog'). */
    source: z.string(),
    /** Field path inside the provider payload when applicable. */
    field: z.string().optional(),
    url: z.string().optional(),
    /** 0..1 — how strongly this reference supports the value. */
    confidence: z.number().min(0).max(1),
    observedAt: IsoDateTime,
});
export const AttributeValue = z.union([z.string(), z.number(), z.boolean()]);
export const ProductAttribute = z.object({
    /** Stable machine key, e.g. 'ram_gb', 'cpu_cores', 'gpu_vram_gb', 'weight_kg'. */
    key: z.string(),
    label: z.string(),
    value: AttributeValue.nullable(),
    unit: z.string().optional(),
    numericValue: z.number().nullable().optional(),
    evidence: EvidenceRef,
});
export const AvailabilityStatus = z.enum([
    'in_stock',
    'out_of_stock',
    'preorder',
    'backorder',
    'unknown',
]);
export const Availability = z.object({
    status: AvailabilityStatus,
    quantity: z.number().int().nullable().optional(),
    observedAt: IsoDateTime,
    evidence: EvidenceRef.optional(),
});
export const ProductCategory = z.enum([
    'laptop',
    'desktop',
    'components',
    'monitor',
    'accessory',
    'phone',
    'tablet',
    'audio',
    'other',
]);
export const Product = z.object({
    id: z.string(),
    /** Provider that returned the record. */
    provider: z.string(),
    externalId: z.string(),
    title: z.string(),
    brand: z.string().optional(),
    category: ProductCategory,
    price: Money,
    /** Optional secondary listing/merchant price. */
    listPrice: Money.optional(),
    currency: CurrencyCode,
    attributes: z.array(ProductAttribute),
    availability: Availability,
    sourceUrl: z.string(),
    evidenceRefs: z.array(EvidenceRef),
    retrievedAt: IsoDateTime,
    /** Provider payload kept for traceability (never sent to the browser beyond /api). */
    raw: z.record(z.string(), z.unknown()).optional(),
});
export const NumericOperator = z.enum(['gte', 'lte', 'eq', 'gt', 'lt', 'between']);
export const CatalogSearchRequest = z.object({
    query: z.string().min(1).max(400),
    category: ProductCategory.optional(),
    currency: CurrencyCode.optional(),
    maxPrice: z.number().nonnegative().optional(),
    minPrice: z.number().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    includeOutOfStock: z.boolean().optional(),
});
export const CatalogSearchResponse = z.object({
    provider: z.string(),
    /** True when the configured provider was unreachable and a documented substitute was used. */
    degraded: z.boolean(),
    degradedReason: z.string().optional(),
    tookMs: z.number(),
    products: z.array(Product),
});
export const ProductDetailsResponse = z.object({
    product: Product,
    provider: z.string(),
    tookMs: z.number(),
});
//# sourceMappingURL=product.js.map