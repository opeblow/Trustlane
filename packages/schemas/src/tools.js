import { z } from 'zod';
import { CorrelationId } from "./common.js";
import { NumericConstraint } from "./intent.js";
import { PolicyCheckRequest } from "./policy.js";
import { CatalogSearchRequest } from "./product.js";
import { RunSnapshot } from "./events.js";
/**
 * Typed tool contracts. Every agent tool call is validated against one of these
 * schemas *before* it reaches the backend — the model can only ever propose
 * structured arguments, never raw HTTP or payment credentials.
 */
export const ParseIntentInput = z.object({
    text: z.string().min(1),
    currency: z.string().length(3).optional(),
    policyApprovalDefault: z.boolean().optional(),
});
export const ValidateConstraintsInput = z.object({
    intentId: z.string().optional(),
    constraints: z.object({
        currency: z.string().length(3),
        numeric: z.array(NumericConstraint),
        budgetMax: z
            .object({ amount: z.number(), currency: z.string().length(3) })
            .optional(),
    }),
});
export const CatalogSearchInput = CatalogSearchRequest;
export const ProductDetailsInput = z.object({
    productId: z.string(),
    provider: z.string().optional(),
});
export const CompareProductsInput = z.object({
    intentId: z.string(),
    productIds: z.array(z.string()).min(1).max(50),
});
export const EvidenceLookupInput = z.object({
    productId: z.string(),
    fields: z.array(z.string()),
});
export const ScoreCandidateInput = z.object({
    intentId: z.string(),
    productId: z.string(),
});
export const ExplainTradeoffsInput = z.object({
    intentId: z.string(),
    productIds: z.array(z.string()).min(1),
});
export const PolicyCheckInput = PolicyCheckRequest;
export const CreatePayPalOrderInput = z.object({
    purchasePlanId: z.string(),
    correlationId: CorrelationId,
    description: z.string().max(127).optional(),
});
export const RequestApprovalInput = z.object({
    purchasePlanId: z.string(),
    planHash: z.string(),
    correlationId: CorrelationId,
});
export const CapturePaymentInput = z.object({
    purchasePlanId: z.string(),
    approvalId: z.string(),
    planHash: z.string(),
    correlationId: CorrelationId,
});
export const GetPayPalOrderInput = z.object({
    paypalOrderId: z.string(),
});
export const VerifyOrderInput = z.object({
    purchasePlanId: z.string(),
    correlationId: CorrelationId,
});
export const TriggerAutomationInput = z.object({
    purchasePlanId: z.string(),
    triggerEventId: z.string(),
});
export const SearchEventsInput = z.object({
    query: z.string().optional(),
    types: z.array(z.string()).optional(),
    severity: z.array(z.enum(['info', 'warn', 'error'])).optional(),
    correlationId: z.string().optional(),
    runId: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
});
export const ToolResultEnvelope = z.object({
    tool: z.string(),
    ok: z.boolean(),
    durationMs: z.number(),
    data: z.unknown().optional(),
    error: z.string().optional(),
});
export const ToolContractMap = {
    parse_intent: ParseIntentInput,
    validate_constraints: ValidateConstraintsInput,
    catalog_search: CatalogSearchInput,
    product_details: ProductDetailsInput,
    compare_products: CompareProductsInput,
    evidence_lookup: EvidenceLookupInput,
    score_candidate: ScoreCandidateInput,
    explain_tradeoffs: ExplainTradeoffsInput,
    policy_check: PolicyCheckInput,
    create_paypal_order: CreatePayPalOrderInput,
    request_approval: RequestApprovalInput,
    capture_payment: CapturePaymentInput,
    get_paypal_order: GetPayPalOrderInput,
    verify_order: VerifyOrderInput,
    trigger_automation: TriggerAutomationInput,
    search_events: SearchEventsInput,
};
export const SnapshotResponse = RunSnapshot;
//# sourceMappingURL=tools.js.map