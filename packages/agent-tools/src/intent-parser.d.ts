import { type CurrencyCodeT, type EngineInfoT, type IntentT, type NumericConstraintT, type ProductCategoryT } from '@autopilot/schemas';
/** Attributes the deterministic parser understands. */
export interface AttributeRule {
    field: string;
    label: string;
    unit?: string;
    /** Lower-case synonyms that identify this attribute in free text. */
    synonyms: string[];
    /** Preferred direction when the user gives a bare number ("32GB RAM"). */
    defaultOp: 'gte' | 'lte' | 'eq';
    /** Value used when the mention implies a minimum ("fast", "lots of"). */
    qualitative?: Record<string, number>;
}
export declare const ATTRIBUTE_RULES: AttributeRule[];
export declare const CATEGORY_KEYWORDS: Array<{
    category: ProductCategoryT;
    keywords: string[];
}>;
export interface ParsedIntent {
    category: ProductCategoryT;
    currency: CurrencyCodeT;
    budgetMax?: number;
    budgetMin?: number;
    numeric: NumericConstraintT[];
    keywords: string[];
    preferences: string[];
    requireApproval: boolean;
    approvalMentioned: boolean;
    notes: string[];
    openQuestions: string[];
    confidence: number;
}
/**
 * Deterministic intent interpreter. It is the product's guaranteed path: the
 * same sentence always yields the same structured constraints, which is what
 * makes money-affecting behaviour auditable. An LLM may enrich the result, but
 * never replaces this parser's authority over budget and approval fields.
 */
export declare function parseIntentDeterministic(text: string, defaultCurrency?: CurrencyCodeT): ParsedIntent;
export declare function buildIntent(input: {
    parsed: ParsedIntent;
    rawText: string;
    runId?: string;
    engine: EngineInfoT;
    requireApprovalOverride?: boolean;
    approvalThreshold?: number;
}): IntentT;
//# sourceMappingURL=intent-parser.d.ts.map