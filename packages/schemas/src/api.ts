import { z } from 'zod';
import { ProviderHealth, CorrelationId } from './common.ts';
import { AuditEvent, AutomationRun, Run, ToolCallRecord } from './events.ts';
import { Intent } from './intent.ts';
import { Product } from './product.ts';
import { Evaluation, Shortlist } from './evaluation.ts';
import { Approval, Payment, PurchasePlan } from './purchase.ts';
import { PolicyDecision, UserPolicy } from './policy.ts';

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
export type HealthResponseT = z.infer<typeof HealthResponse>;

export const CreateIntentResponse = z.object({
  intent: Intent,
  run: Run.optional(),
});
export type CreateIntentResponseT = z.infer<typeof CreateIntentResponse>;

export const RunResponse = z.object({
  run: Run,
});
export type RunResponseT = z.infer<typeof RunResponse>;

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
export type RunDetailResponseT = z.infer<typeof RunDetailResponse>;

export const DiscoveryResponse = z.object({
  runId: z.string(),
  provider: z.string(),
  degraded: z.boolean(),
  degradedReason: z.string().optional(),
  tookMs: z.number(),
  products: z.array(Product),
});
export type DiscoveryResponseT = z.infer<typeof DiscoveryResponse>;

export const PolicyCheckResponse = z.object({
  decision: PolicyDecision,
  policy: UserPolicy,
});
export type PolicyCheckResponseT = z.infer<typeof PolicyCheckResponse>;

export const PreparePurchaseResponse = z.object({
  plan: PurchasePlan,
  approval: Approval.nullable(),
  payment: Payment.nullable(),
  /** Where the buyer must go to authorise, when the provider requires a redirect. */
  approvalUrl: z.string().nullable(),
  /** True when the plan is blocked by policy and no PayPal order was created. */
  blocked: z.boolean(),
});
export type PreparePurchaseResponseT = z.infer<typeof PreparePurchaseResponse>;

export const ApprovePurchaseResponse = z.object({
  approval: Approval,
  plan: PurchasePlan,
});
export type ApprovePurchaseResponseT = z.infer<typeof ApprovePurchaseResponse>;

export const CapturePurchaseResponse = z.object({
  payment: Payment,
  plan: PurchasePlan,
  automation: AutomationRun.nullable(),
});
export type CapturePurchaseResponseT = z.infer<typeof CapturePurchaseResponse>;

export const AutomationTestResponse = z.object({
  status: z.enum(['sent', 'failed', 'unconfigured']),
  hook: z.string(),
  responseSummary: z.string(),
  durationMs: z.number(),
  run: AutomationRun.nullable(),
});
export type AutomationTestResponseT = z.infer<typeof AutomationTestResponse>;

export const IdempotentReplay = z.object({
  idempotentReplay: z.boolean(),
  correlationId: CorrelationId.optional(),
});

export const ListPoliciesResponse = z.object({
  policies: z.array(UserPolicy),
});
export type ListPoliciesResponseT = z.infer<typeof ListPoliciesResponse>;

export const ListRunsResponse = z.object({
  runs: z.array(Run),
});
export type ListRunsResponseT = z.infer<typeof ListRunsResponse>;

export const OkResponse = z.object({ ok: z.literal(true) });