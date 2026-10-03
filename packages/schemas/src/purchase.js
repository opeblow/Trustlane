import { z } from 'zod';
import { CorrelationId, IsoDateTime, ProviderName } from "./common.js";
import { Money } from "./money.js";
import { PolicyDecision } from "./policy.js";
import { Product, ProductCategory } from "./product.js";
export const RiskFlag = z.object({
    code: z.string(),
    severity: z.enum(['info', 'warn', 'block']),
    message: z.string(),
});
export const LineItem = z.object({
    productId: z.string(),
    title: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: Money,
    total: Money,
    category: ProductCategory,
    merchant: z.string(),
});
export const PurchasePlanStatus = z.enum([
    'draft',
    'policy_blocked',
    'awaiting_approval',
    'approved',
    'paypal_order_created',
    'payment_pending',
    'paid',
    'verified',
    'failed',
    'cancelled',
    'expired',
    'stale',
]);
export const PurchasePlan = z.object({
    id: z.string(),
    runId: z.string(),
    intentId: z.string(),
    product: Product,
    lineItems: z.array(LineItem),
    subtotal: Money,
    shipping: Money,
    tax: Money,
    total: Money,
    currency: z.string(),
    policyResult: PolicyDecision,
    paypalOrderId: z.string().nullable(),
    approvalId: z.string().nullable(),
    status: PurchasePlanStatus,
    riskFlags: z.array(RiskFlag),
    /** sha256 over the money-relevant plan fields; approvals are bound to this. */
    planHash: z.string(),
    /** ISO time of the provider price quote this plan was built from. */
    quotedAt: IsoDateTime,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    expiresAt: IsoDateTime,
    correlationId: CorrelationId,
});
export const AuthorizationScope = z.object({
    planId: z.string(),
    planHash: z.string(),
    amount: Money,
    currency: z.string(),
    policyId: z.string(),
    policyVersion: z.number().int(),
    /** What the human actually authorised, in one sentence. */
    description: z.string(),
    correlationId: CorrelationId,
});
export const ApprovalStatus = z.enum([
    'pending',
    'approved',
    'denied',
    'expired',
    'revoked',
    'consumed',
]);
export const Approval = z.object({
    id: z.string(),
    purchasePlanId: z.string(),
    runId: z.string(),
    authorizationScope: AuthorizationScope,
    status: ApprovalStatus,
    actor: z.string(),
    requestedAt: IsoDateTime,
    approvedAt: IsoDateTime.nullable(),
    deniedAt: IsoDateTime.nullable(),
    expiresAt: IsoDateTime,
    note: z.string().optional(),
});
export const PaymentStatus = z.enum([
    'created',
    'awaiting_approval',
    'approved',
    'captured',
    'refunded',
    'failed',
    'cancelled',
]);
export const VerificationState = z.enum(['unverified', 'verified', 'failed']);
export const Payment = z.object({
    id: z.string(),
    purchasePlanId: z.string(),
    runId: z.string(),
    paypalOrderId: z.string(),
    transactionId: z.string().nullable(),
    status: PaymentStatus,
    amount: Money,
    currency: z.string(),
    capturedAt: IsoDateTime.nullable(),
    verificationState: VerificationState,
    /** 'paypal' when talking to the real sandbox, 'simulated' otherwise. Always surfaced in the UI. */
    provider: z.enum(['paypal', 'simulated']),
    mode: z.enum(['sandbox', 'live', 'simulated']),
    attempts: z.number().int(),
    lastError: z.string().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    raw: z.record(z.string(), z.unknown()).optional(),
});
export const PreparePurchaseRequest = z.object({
    runId: z.string(),
    productId: z.string(),
    policyId: z.string().optional(),
    quantity: z.number().int().min(1).max(10).optional(),
    /** Confirm the plan against the intended plan hash (defence against stale UI). */
    expectedPlanHash: z.string().optional(),
});
export const ApprovePurchaseRequest = z.object({
    actor: z.string().min(1).default('owner'),
    /** Must match the plan's current hash, proving the human saw these exact terms. */
    planHash: z.string(),
    /** Optional second confirmation step for large amounts. */
    confirm: z.boolean().default(false),
    note: z.string().max(500).optional(),
});
export const CapturePurchaseRequest = z.object({
    actor: z.string().min(1).default('owner'),
    planHash: z.string(),
    /** Optional PayPal payer id returned by the approval step. */
    payerId: z.string().optional(),
});
export const PaymentSource = z.object({
    provider: ProviderName,
    mode: z.enum(['sandbox', 'live', 'simulated']),
});
//# sourceMappingURL=purchase.js.map