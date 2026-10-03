import { z } from 'zod';
import { CorrelationId } from './common.ts';
import { NumericConstraint } from './intent.ts';
import { PolicyCheckRequest } from './policy.ts';
import { CatalogSearchRequest } from './product.ts';
import { RunSnapshot } from './events.ts';

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
export type ParseIntentInputT = z.infer<typeof ParseIntentInput>;

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
export type ValidateConstraintsInputT = z.infer<typeof ValidateConstraintsInput>;

export const CatalogSearchInput = CatalogSearchRequest;
export type CatalogSearchInputT = z.infer<typeof CatalogSearchInput>;

export const ProductDetailsInput = z.object({
  productId: z.string(),
  provider: z.string().optional(),
});
export type ProductDetailsInputT = z.infer<typeof ProductDetailsInput>;

export const CompareProductsInput = z.object({
  intentId: z.string(),
  productIds: z.array(z.string()).min(1).max(50),
});
export type CompareProductsInputT = z.infer<typeof CompareProductsInput>;

export const EvidenceLookupInput = z.object({
  productId: z.string(),
  fields: z.array(z.string()),
});
export type EvidenceLookupInputT = z.infer<typeof EvidenceLookupInput>;

export const ScoreCandidateInput = z.object({
  intentId: z.string(),
  productId: z.string(),
});
export type ScoreCandidateInputT = z.infer<typeof ScoreCandidateInput>;

export const ExplainTradeoffsInput = z.object({
  intentId: z.string(),
  productIds: z.array(z.string()).min(1),
});
export type ExplainTradeoffsInputT = z.infer<typeof ExplainTradeoffsInput>;

export const PolicyCheckInput = PolicyCheckRequest;
export type PolicyCheckInputT = z.infer<typeof PolicyCheckInput>;

export const CreatePayPalOrderInput = z.object({
  purchasePlanId: z.string(),
  correlationId: CorrelationId,
  description: z.string().max(127).optional(),
});
export type CreatePayPalOrderInputT = z.infer<typeof CreatePayPalOrderInput>;

export const RequestApprovalInput = z.object({
  purchasePlanId: z.string(),
  planHash: z.string(),
  correlationId: CorrelationId,
});
export type RequestApprovalInputT = z.infer<typeof RequestApprovalInput>;

export const CapturePaymentInput = z.object({
  purchasePlanId: z.string(),
  approvalId: z.string(),
  planHash: z.string(),
  correlationId: CorrelationId,
});
export type CapturePaymentInputT = z.infer<typeof CapturePaymentInput>;

export const GetPayPalOrderInput = z.object({
  paypalOrderId: z.string(),
});
export type GetPayPalOrderInputT = z.infer<typeof GetPayPalOrderInput>;

export const VerifyOrderInput = z.object({
  purchasePlanId: z.string(),
  correlationId: CorrelationId,
});
export type VerifyOrderInputT = z.infer<typeof VerifyOrderInput>;

export const TriggerAutomationInput = z.object({
  purchasePlanId: z.string(),
  triggerEventId: z.string(),
});
export type TriggerAutomationInputT = z.infer<typeof TriggerAutomationInput>;

export const SearchEventsInput = z.object({
  query: z.string().optional(),
  types: z.array(z.string()).optional(),
  severity: z.array(z.enum(['info', 'warn', 'error'])).optional(),
  correlationId: z.string().optional(),
  runId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type SearchEventsInputT = z.infer<typeof SearchEventsInput>;

export const ToolResultEnvelope = z.object({
  tool: z.string(),
  ok: z.boolean(),
  durationMs: z.number(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolResultEnvelopeT = z.infer<typeof ToolResultEnvelope>;

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
} as const;
export type ToolContractMapT = typeof ToolContractMap;

export type ToolNameKey = keyof ToolContractMapT;

export const SnapshotResponse = RunSnapshot;