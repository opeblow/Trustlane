import { isoPlusMinutes, nowIso, } from '@autopilot/schemas';
function toMinor(amount) {
    return Math.round(amount * 100);
}
/** Attribute keys the comparison grid expects; anything else is kept as extra. */
const KNOWN_KEYS = new Set([
    'ram_gb',
    'storage_gb',
    'cpu_cores',
    'cpu_score',
    'gpu_vram_gb',
    'gpu_score',
    'display_in',
    'weight_kg',
    'battery_wh',
    'warranty_years',
]);
/**
 * Normalise a provider payload into the internal product schema.
 *
 * Every attribute carries an evidence reference. When the provider did not
 * supply a value, the attribute is emitted with `value: null` and evidence kind
 * `unverified` so the UI is forced to show it as unknown rather than as fact.
 */
export function normalizeProduct(input) {
    const retrievedAt = input.retrievedAt ?? nowIso();
    const evidence = (kind, field, confidence) => ({
        kind,
        source: input.provider,
        field,
        confidence,
        observedAt: retrievedAt,
        ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
    });
    const attributes = Object.entries(input.attributes ?? {}).map(([key, value]) => {
        const isKnown = KNOWN_KEYS.has(key);
        const numeric = typeof value === 'number' ? value : parseNumeric(value);
        return {
            key,
            label: humanise(key),
            value: value === null || value === undefined ? null : value,
            numericValue: numeric,
            unit: unitFor(key),
            evidence: value === null || value === undefined
                ? evidence('unverified', key, 0)
                : evidence(isKnown ? 'provider_field' : 'provider_page', key, isKnown ? 0.9 : 0.6),
        };
    });
    const availabilityStatus = input.availability?.status ?? 'unknown';
    return {
        id: `${input.provider}:${input.externalId}`,
        provider: input.provider,
        externalId: input.externalId,
        title: input.title,
        ...(input.brand ? { brand: input.brand } : {}),
        category: input.category ?? 'other',
        price: { amount: Math.round(input.price * 100) / 100, currency: input.currency },
        ...(input.listPrice !== undefined
            ? { listPrice: { amount: Math.round(input.listPrice * 100) / 100, currency: input.currency } }
            : {}),
        currency: input.currency,
        attributes,
        availability: {
            status: availabilityStatus,
            ...(input.availability?.quantity !== undefined ? { quantity: input.availability.quantity } : {}),
            observedAt: input.availability?.observedAt ?? retrievedAt,
            evidence: evidence(availabilityStatus === 'unknown' ? 'unverified' : 'provider_field', 'availability', availabilityStatus === 'unknown' ? 0 : 0.8),
        },
        sourceUrl: input.sourceUrl ?? `https://${input.provider}.invalid/products/${input.externalId}`,
        evidenceRefs: [
            evidence('provider_field', 'price', 0.95),
            evidence(availabilityStatus === 'unknown' ? 'unverified' : 'provider_field', 'availability', availabilityStatus === 'unknown' ? 0 : 0.8),
        ],
        retrievedAt,
        ...(input.raw ? { raw: input.raw } : {}),
    };
}
function parseNumeric(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value !== 'string')
        return null;
    const match = value.match(/-?\d+(\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : null;
}
function unitFor(key) {
    switch (key) {
        case 'ram_gb':
        case 'storage_gb':
        case 'gpu_vram_gb':
            return 'GB';
        case 'cpu_cores':
            return 'cores';
        case 'cpu_score':
        case 'gpu_score':
            return 'pts';
        case 'display_in':
            return 'in';
        case 'weight_kg':
            return 'kg';
        case 'battery_wh':
            return 'Wh';
        case 'warranty_years':
            return 'years';
        default:
            return undefined;
    }
}
function humanise(key) {
    const special = {
        ram_gb: 'Memory',
        storage_gb: 'Storage',
        cpu_cores: 'CPU cores',
        cpu_score: 'CPU benchmark score',
        gpu_vram_gb: 'GPU memory',
        gpu_score: 'GPU benchmark score',
        display_in: 'Display size',
        weight_kg: 'Weight',
        battery_wh: 'Battery',
        warranty_years: 'Warranty',
    };
    if (special[key])
        return special[key];
    return key
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
/** Rank/filter helper shared by every catalog provider. */
export function applyCatalogFilters(products, request) {
    const query = request.query.toLowerCase();
    let result = products.filter((product) => {
        if (request.category && product.category !== request.category)
            return false;
        if (request.maxPrice !== undefined && toMinor(product.price.amount) > toMinor(request.maxPrice))
            return false;
        if (request.minPrice !== undefined && toMinor(product.price.amount) < toMinor(request.minPrice))
            return false;
        const haystack = `${product.title} ${product.brand ?? ''} ${product.attributes
            .map((a) => `${a.label} ${a.value ?? ''}`)
            .join(' ')}`.toLowerCase();
        const terms = query.split(/\s+/).filter((t) => t.length > 2);
        if (terms.length > 0 && !terms.some((t) => haystack.includes(t)))
            return false;
        return true;
    });
    if (!request.includeOutOfStock) {
        // Out-of-stock products are kept but ranked last, never silently hidden.
        result = [...result].sort((a, b) => availabilityRank(a) - availabilityRank(b));
    }
    return result.slice(0, request.limit ?? 12);
}
function availabilityRank(product) {
    switch (product.availability.status) {
        case 'in_stock':
            return 0;
        case 'preorder':
            return 1;
        case 'backorder':
            return 2;
        case 'unknown':
            return 3;
        default:
            return 4;
    }
}
export function defaultQuoteAgeMinutes() {
    return isoPlusMinutes(-0).length > 0 ? 15 : 15;
}
//# sourceMappingURL=normalize.js.map