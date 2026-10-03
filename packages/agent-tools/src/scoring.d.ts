import { type ConstraintResultT, type EvaluationT, type EvidenceQualityT, type IntentT, type ProductT, type ShortlistT } from '@autopilot/schemas';
export interface ScoreWeights {
    constraints: number;
    budget: number;
    evidence: number;
    availability: number;
    value: number;
}
export declare const DEFAULT_WEIGHTS: ScoreWeights;
/**
 * Evaluate one candidate against the structured intent. Fully deterministic:
 * the same product + intent always produce the same score, constraint results,
 * evidence gaps and trade-offs. That is what makes the Decision screen honest.
 */
export declare function evaluateProduct(intent: IntentT, product: ProductT, options?: {
    weights?: ScoreWeights;
    modelVersion?: string;
}): EvaluationT;
export declare function assessEvidence(product: ProductT, constraintResults: ConstraintResultT[]): EvidenceQualityT;
/** Rank evaluated candidates and record why the rejects were rejected. */
export declare function buildShortlist(input: {
    runId: string;
    intent: IntentT;
    evaluations: EvaluationT[];
    products: ProductT[];
    limit?: number;
}): ShortlistT;
export declare function priceMinor(product: ProductT): number;
//# sourceMappingURL=scoring.d.ts.map