import { isoPlusMinutes, nowIso, } from '@autopilot/schemas';
import { applyCatalogFilters, normalizeProduct } from "./normalize.js";
import { LOCAL_CATALOG } from "./local-catalog.js";
export const LOCAL_CATALOG_PROVIDER = 'local-catalog';
/**
 * Reference catalog shipped with the repository. Used when Channel3 credentials
 * are absent so that discovery, evaluation and the whole governed flow remain
 * runnable. It is explicitly labelled as bundled reference data everywhere it
 * surfaces (provider name, audit events and the Settings screen).
 */
export class LocalCatalogProvider {
    name = LOCAL_CATALOG_PROVIDER;
    products;
    constructor(records = LOCAL_CATALOG) {
        const retrievedAt = nowIso();
        this.products = records.map((record) => normalizeProduct({
            provider: LOCAL_CATALOG_PROVIDER,
            externalId: record.externalId,
            title: record.title,
            brand: record.brand,
            category: record.category,
            price: record.price,
            currency: record.currency,
            ...(record.listPrice !== undefined ? { listPrice: record.listPrice } : {}),
            availability: { status: record.availability, observedAt: retrievedAt },
            attributes: record.attributes,
            retrievedAt,
            sourceUrl: `https://local-catalog.invalid/products/${record.externalId}`,
            raw: { bundled: true, note: 'Bundled reference catalog shipped with Autopilot.' },
        }));
    }
    async health() {
        return {
            provider: 'channel3',
            status: 'simulated',
            detail: `Channel3 credentials are not configured; using the bundled reference catalog (${this.products.length} records) instead of live inventory.`,
            checkedAt: nowIso(),
            requiresCredentials: true,
        };
    }
    async search(request) {
        const started = Date.now();
        const products = applyCatalogFilters(this.products, request);
        return {
            provider: this.name,
            degraded: true,
            degradedReason: 'Channel3 is not configured. Results come from the bundled reference catalog shipped with Autopilot, not from live inventory.',
            tookMs: Date.now() - started,
            products,
        };
    }
    async details(productId) {
        const externalId = productId.startsWith(`${this.name}:`) ? productId.slice(this.name.length + 1) : productId;
        return this.products.find((p) => p.externalId === externalId);
    }
    all() {
        return this.products;
    }
}
/**
 * Channel3 adapter. Channel3 exposes no public, documented catalog API that can
 * be called without a hackathon grant, so this adapter talks to a configurable
 * JSON endpoint and maps its payload into the internal schema. Configure
 * CHANNEL3_BASE_URL (+ optional CHANNEL3_API_KEY) to point it at the real
 * service; until then the API reports the provider as unconfigured instead of
 * inventing results.
 */
export class Channel3Provider {
    config;
    name = 'channel3';
    constructor(config) {
        this.config = config;
    }
    async health() {
        const started = Date.now();
        try {
            const response = await this.fetchJson('/health');
            return {
                provider: 'channel3',
                status: 'live',
                detail: `Channel3 responded in ${Date.now() - started}ms: ${JSON.stringify(response).slice(0, 160)}`,
                checkedAt: nowIso(),
                endpoint: this.config.baseUrl,
                requiresCredentials: true,
            };
        }
        catch (error) {
            return {
                provider: 'channel3',
                status: 'degraded',
                detail: `Channel3 is configured but unreachable: ${error instanceof Error ? error.message : String(error)}`,
                checkedAt: nowIso(),
                endpoint: this.config.baseUrl,
                requiresCredentials: true,
            };
        }
    }
    async search(request) {
        const started = Date.now();
        const payload = (await this.fetchJson('/search', {
            query: request.query,
            category: request.category,
            currency: request.currency,
            limit: request.limit ?? 12,
        }));
        const items = payload.items ?? payload.results ?? [];
        const products = items.map((item) => this.toProduct(item));
        return {
            provider: this.name,
            degraded: false,
            tookMs: Date.now() - started,
            products: applyCatalogFilters(products, request),
        };
    }
    async details(productId) {
        const externalId = productId.startsWith(`${this.name}:`) ? productId.slice(this.name.length + 1) : productId;
        try {
            const payload = (await this.fetchJson(`/products/${encodeURIComponent(externalId)}`));
            return this.toProduct(payload);
        }
        catch {
            return undefined;
        }
    }
    toProduct(item) {
        const attributes = (item.attributes ?? item.specs ?? {});
        return normalizeProduct({
            provider: this.name,
            externalId: String(item.id ?? item.sku ?? item.externalId ?? 'unknown'),
            title: String(item.title ?? item.name ?? 'Untitled product'),
            ...(item.brand ? { brand: String(item.brand) } : {}),
            category: item.category ?? 'other',
            price: Number(item.price ?? 0),
            currency: String(item.currency ?? 'USD'),
            availability: {
                status: (item.availability ?? 'unknown'),
                observedAt: nowIso(),
            },
            attributes,
            sourceUrl: item.url ? String(item.url) : undefined,
            raw: item,
        });
    }
    async fetchJson(path, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
        try {
            const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    accept: 'application/json',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Channel3 responded ${response.status}`);
            }
            return await response.json();
        }
        finally {
            clearTimeout(timer);
        }
    }
}
export function createCatalogStack(config) {
    const local = new LocalCatalogProvider();
    if (config.baseUrl) {
        return {
            primary: new Channel3Provider({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs }),
            fallback: local,
            description: `Channel3 (${config.baseUrl}) with bundled-catalog fallback.`,
        };
    }
    return { primary: local, description: 'Bundled reference catalog (set CHANNEL3_BASE_URL to use Channel3).' };
}
/**
 * Search with an explicit, honest fallback: if the configured provider fails we
 * either use the documented substitute or report failure. We never silently
 * return the substitute as if it were live.
 */
export async function searchWithFallback(stack, request) {
    try {
        const result = await stack.primary.search(request);
        if (result.products.length > 0 || request.includeOutOfStock !== undefined)
            return result;
        if (stack.fallback && stack.primary !== stack.fallback) {
            const fallback = await stack.fallback.search(request);
            return {
                ...fallback,
                degraded: true,
                degradedReason: `Channel3 returned no results for "${request.query}"; showing bundled reference records instead.`,
            };
        }
        return result;
    }
    catch (error) {
        if (!stack.fallback)
            throw error;
        const fallback = await stack.fallback.search(request);
        return {
            ...fallback,
            degraded: true,
            degradedReason: `Channel3 search failed (${error instanceof Error ? error.message : String(error)}); showing bundled reference records instead.`,
        };
    }
}
export function quoteTimestamp() {
    return isoPlusMinutes(0);
}
//# sourceMappingURL=provider.js.map