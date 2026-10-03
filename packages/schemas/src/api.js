import { z } from 'zod';
import { ProviderHealth, CorrelationId } from "./common.js";
import { AuditEvent, AutomationRun, Run, ToolCallRecord } from "./events.js";
import { Intent } from "./intent.js";
import { Product } from "./product.js";
import { Evaluation, Shortlist } from "./evaluation.js";
import { Approval, Payment, PurchasePlan } from "./purchase.js";
import { PolicyDecision, UserPolicy } from "./policy.js";
export const HealthResponse = z.object({
    status: z.enum(['ok', 'degraded', 'fail']),
    service: z.string(),
    version: z.string(),
    mode: z.enum(['sandbox', 'live', 'simulated']),
    uptimeSeconds: z.number(),
    database: z.object({
        engine: z.string(),
        path: z.string(),
        ok: z.boolean(),
    }),
    providers: z.array(ProviderHealth),
    checks: z.object({
        policyEngine: z.boolean(),
        eventLog: z.boolean(),
        paymentAdapter: z.boolean(),
    }),
    timestamp: z.string(),
});
export const CreateIntentResponse = z.object({
    intent: Intent,
    run: Run.optional(),
});
export const RunResponse = z.object({
    run: Run,
});
export const RunDetailResponse = z.object({
    run: Run,
    intent: Intent,
    products: z.array(Product),
    evaluations: z.array(Evaluation),
    shortlist: Shortlist.nullable(),
    plan: PurchasePlan.nullable(),
    approval: Approval.nullable(),
    payment: Payment.nullable(),
    automations: z.array(AutomationRun),
    events: z.array(AuditEvent),
    toolCalls: z.array(ToolCallRecord),
});
export const DiscoveryResponse = z.object({
    runId: z.string(),
    provider: z.string(),
    degraded: z.boolean(),
    degradedReason: z.string().optional(),
    tookMs: z.number(),
    products: z.array(Product),
});
export const PolicyCheckResponse = z.object({
    decision: PolicyDecision,
    policy: UserPolicy,
});
export const PreparePurchaseResponse = z.object({
    plan: PurchasePlan,
    approval: Approval.nullable(),
    payment: Payment.nullable(),
    /** Where the buyer must go to authorise, when the provider requires a redirect. */
    approvalUrl: z.string().nullable(),
    /** True when the plan is blocked by policy and no PayPal order was created. */
    blocked: z.boolean(),
});
export const ApprovePurchaseResponse = z.object({
    approval: Approval,
    plan: PurchasePlan,
});
export const CapturePurchaseResponse = z.object({
    payment: Payment,
    plan: PurchasePlan,
    automation: AutomationRun.nullable(),
});
export const AutomationTestResponse = z.object({
    status: z.enum(['sent', 'failed', 'unconfigured']),
    hook: z.string(),
    responseSummary: z.string(),
    durationMs: z.number(),
    run: AutomationRun.nullable(),
});
export const IdempotentReplay = z.object({
    idempotentReplay: z.boolean(),
    correlationId: CorrelationId.optional(),
});
export const ListPoliciesResponse = z.object({
    policies: z.array(UserPolicy),
});
export const ListRunsResponse = z.object({
    runs: z.array(Run),
});
export const OkResponse = z.object({ ok: z.literal(true) });
//# sourceMappingURL=api.js.map