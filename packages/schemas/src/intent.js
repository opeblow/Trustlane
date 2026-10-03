import { z } from 'zod';
import { IsoDateTime } from "./common.js";
import { CurrencyCode, Money } from "./money.js";
import { NumericOperator, ProductCategory } from "./product.js";
export const ConstraintSource = z.enum(['user', 'policy', 'inferred', 'default']);
export const NumericConstraint = z.object({
    /** Attribute key this constraint applies to ('price', 'ram_gb', 'cpu_score', ...). */
    field: z.string(),
    label: z.string(),
    op: NumericOperator,
    value: z.number(),
    /** Upper bound for op='between'. */
    valueMax: z.number().optional(),
    unit: z.string().optional(),
    source: ConstraintSource,
    /** 0..1 — how much this constraint influences ranking (hard constraints are also gating). */
    weight: z.number().min(0).max(1).default(1),
    /** Hard constraints can disqualify a candidate; soft ones only affect score. */
    hard: z.boolean().default(true),
});
export const IntentConstraints = z.object({
    currency: CurrencyCode,
    budgetMax: Money.optional(),
    budgetMin: Money.optional(),
    numeric: z.array(NumericConstraint),
    keywords: z.array(z.string()),
    preferences: z.array(z.string()),
    blockedCategories: z.array(ProductCategory),
    excludedTerms: z.array(z.string()),
    requireApproval: z.boolean(),
});
export const IntentStatus = z.enum([
    'draft',
    'interpreted',
    'discovering',
    'evaluated',
    'decided',
    'blocked',
    'failed',
]);
export const EngineInfo = z.object({
    /** Which interpreter produced the result. */
    name: z.enum(['deterministic', 'llm-assisted', 'llm']),
    provider: z.string().optional(),
    model: z.string().optional(),
    /** True when an LLM contributed; the deterministic validation still runs afterwards. */
    usedLlm: z.boolean(),
    latencyMs: z.number().optional(),
});
export const Intent = z.object({
    id: z.string(),
    runId: z.string().optional(),
    rawText: z.string(),
    category: ProductCategory,
    constraints: IntentConstraints,
    budget: Money.optional(),
    approvalRequired: z.boolean(),
    createdAt: IsoDateTime,
    status: IntentStatus,
    engine: EngineInfo,
    /** 0..1 confidence in the structured interpretation. */
    confidence: z.number().min(0).max(1),
    /** Human-readable notes about assumptions the agent made. */
    notes: z.array(z.string()),
    /** Questions the agent could not resolve from the request. */
    openQuestions: z.array(z.string()),
});
export const CreateIntentRequest = z.object({
    text: z.string().min(3).max(2000),
    currency: CurrencyCode.optional(),
    /** Force approval even when the request does not mention it. */
    requireApproval: z.boolean().optional(),
    policyId: z.string().optional(),
});
export const UpdateIntentConstraintsRequest = z.object({
    /** Replaces the structured constraints after a user edit (compare grid). */
    numeric: z.array(NumericConstraint).optional(),
    keywords: z.array(z.string()).optional(),
    preferences: z.array(z.string()).optional(),
    budgetMax: Money.optional(),
    budgetMin: Money.optional(),
    requireApproval: z.boolean().optional(),
});
//# sourceMappingURL=intent.js.map