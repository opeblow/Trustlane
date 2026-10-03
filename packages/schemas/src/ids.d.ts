export declare function newId(prefix: string): string;
export declare function newCorrelationId(): string;
/** Stable short hash used for plan hashes and policy input hashes. */
export declare function sha256(input: string | Record<string, unknown>): string;
/** Deterministic JSON serialisation (sorted keys) so hashes are reproducible. */
export declare function stableStringify(value: unknown): string;
export declare function nowIso(): string;
export declare function isoPlusMinutes(minutes: number, from?: Date): string;
export declare function isoPlusDays(days: number, from?: Date): string;
export declare function ageInMinutes(iso: string, now?: Date): number;
//# sourceMappingURL=ids.d.ts.map