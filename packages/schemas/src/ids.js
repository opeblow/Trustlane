import { createHash, randomUUID } from 'node:crypto';
export function newId(prefix) {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
export function newCorrelationId() {
    return `corr_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}
/** Stable short hash used for plan hashes and policy input hashes. */
export function sha256(input) {
    const payload = typeof input === 'string' ? input : stableStringify(input);
    return createHash('sha256').update(payload).digest('hex');
}
/** Deterministic JSON serialisation (sorted keys) so hashes are reproducible. */
export function stableStringify(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
export function nowIso() {
    return new Date().toISOString();
}
export function isoPlusMinutes(minutes, from = new Date()) {
    return new Date(from.getTime() + minutes * 60_000).toISOString();
}
export function isoPlusDays(days, from = new Date()) {
    return isoPlusMinutes(days * 24 * 60, from);
}
export function ageInMinutes(iso, now = new Date()) {
    const t = Date.parse(iso);
    if (Number.isNaN(t))
        return Number.POSITIVE_INFINITY;
    return (now.getTime() - t) / 60_000;
}
//# sourceMappingURL=ids.js.map