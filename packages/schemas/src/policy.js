import { z } from 'zod';
import { CorrelationId, IsoDateTime } from "./common.js";
import { CurrencyCode, Money } from "./money.js";
import { ProductCategory } from "./product.js";
export const UserPolicy = z.object({
    id: z.string(),
    name: z.string(),
    currency: CurrencyCode,
    /** Hard ceiling for a single transaction. */
    maxTransaction: Money,
    /** Rolling 24h ceiling across all approved executions. */
    dailyLimit: Money,
    /** Any execution at or above this amount requires explicit approval. */
    approvalThreshold: Money,
    requireApproval: z.boolean(),
    blockedCategories: z.array(ProductCategory),
    /** null means "all categories allowed". */
    allowedCategories: z.array(ProductCategory).nullable(),
    blockedMerchants: z.array(z.string()),
    /** Reject executions whose quoted price is older than this many minutes. */
    maxQuoteAgeMinutes: z.number().int().min(0).max(10080),
    /** Kill switch: blocks every money-affecting action immediately. */
    emergencyStop: z.boolean(),
    version: z.number().int().min(1),
    updatedAt: IsoDateTime,
});
export const PolicyOutcome = z.enum(['allow', 'requires_approval', 'deny']);
export const PolicyRuleResult = z.object({
    rule: z.enum([
        'currency_match',
        'max_transaction',
        'daily_limit',
        'approval_threshold',
        'blocked_category',
        'allowed_category',
        'blocked_merchant',
        'quote_freshness',
        'availability',
        'emergency_stop',
        'suspicious_amount',
    ]),
    outcome: z.enum(['pass', 'warn', 'block']),
    message: z.string(),
    /** Numeric evidence for the decision, e.g. { amount: 1499, limit: 1500 }. */
    detail: z.record(z.string(), z.unknown()).optional(),
});
export const PolicyDecision = z.object({
    policyId: z.string(),
    policyVersion: z.number().int(),
    outcome: PolicyOutcome,
    /** True only when decision === 'requires_approval'. */
    approvalRequired: z.boolean(),
    rules: z.array(PolicyRuleResult),
    evaluatedAt: IsoDateTime,
    /** Hash of every input, so an approval can be bound to exactly this decision. */
    inputHash: z.string(),
    correlationId: CorrelationId,
});
export const PolicyCheckRequest = z.object({
    amount: Money,
    category: ProductCategory,
    currency: CurrencyCode.optional(),
    merchant: z.string().optional(),
    productId: z.string().optional(),
    policyId: z.string().optional(),
    /** ISO timestamp of the quoted price the decision is based on. */
    quotedAt: IsoDateTime.optional(),
    availability: z.enum([
        'in_stock',
        'out_of_stock',
        'preorder',
        'backorder',
        'unknown',
    ]).optional(),
    correlationId: CorrelationId.optional(),
});
export const UpsertPolicyRequest = UserPolicy.omit({ id: true, version: true, updatedAt: true }).extend({
    /** Optional id when creating a new policy; required when updating an existing one. */
    id: z.string().optional(),
    /** Bumping this creates a new immutable policy version. */
    expectedVersion: z.number().int().optional(),
});
//# sourceMappingURL=policy.js.map