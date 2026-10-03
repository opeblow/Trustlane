import { z } from 'zod';
import { CorrelationId, IsoDateTime, Severity } from "./common.js";
import { EngineInfo } from "./intent.js";
/** Every stage of the governed commerce loop. */
export const RunStage = z.enum([
    'intent',
    'discover',
    'evaluate',
    'decide',
    'policy',
    'prepare',
    'approve',
    'pay',
    'verify',
    'automate',
    'audit',
    'done',
]);
export const RunStatus = z.enum([
    'queued',
    'running',
    'awaiting_approval',
    'blocked',
    'completed',
    'failed',
    'cancelled',
]);
export const ToolName = z.enum([
    'parse_intent',
    'validate_constraints',
    'catalog_search',
    'product_details',
    'compare_products',
    'evidence_lookup',
    'score_candidate',
    'explain_tradeoffs',
    'policy_check',
    'create_paypal_order',
    'request_approval',
    'capture_payment',
    'get_paypal_order',
    'verify_order',
    'trigger_automation',
    'search_events',
]);
export const ToolCallStatus = z.enum(['ok', 'error', 'denied']);
export const ToolCallRecord = z.object({
    id: z.string(),
    runId: z.string(),
    correlationId: CorrelationId,
    tool: ToolName,
    /** Validated arguments — never raw model text. */
    arguments: z.record(z.string(), z.unknown()),
    status: ToolCallStatus,
    startedAt: IsoDateTime,
    durationMs: z.number(),
    resultSummary: z.string().optional(),
    error: z.string().nullable(),
});
export const Run = z.object({
    id: z.string(),
    intentId: z.string(),
    correlationId: CorrelationId,
    stage: RunStage,
    status: RunStatus,
    engine: EngineInfo,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    /** 0..1 */
    progress: z.number().min(0).max(1),
    progressLabel: z.string(),
    candidateCount: z.number().int(),
    shortlistedProductIds: z.array(z.string()),
    planId: z.string().nullable(),
    policyId: z.string().nullable(),
    blockedReason: z.string().nullable(),
    summary: z.string().nullable(),
});
export const EventType = z.enum([
    'run.created',
    'run.stage.changed',
    'run.failed',
    'run.cancelled',
    'intent.created',
    'intent.updated',
    'catalog.search.started',
    'catalog.search.completed',
    'product.retrieved',
    'product.evaluated',
    'shortlist.created',
    'evidence.gap.detected',
    'policy.checked',
    'policy.updated',
    'plan.created',
    'plan.invalidated',
    'approval.requested',
    'approval.granted',
    'approval.denied',
    'approval.expired',
    'paypal.order.created',
    'paypal.approval.completed',
    'payment.captured',
    'payment.failed',
    'order.verified',
    'automation.triggered',
    'automation.failed',
    'action.failed',
    'tool.called',
    'system.health',
]);
export const AuditEvent = z.object({
    id: z.string(),
    correlationId: CorrelationId,
    runId: z.string().nullable(),
    type: EventType,
    /** Who caused it: 'user', 'agent', 'system', or an actor id. */
    actor: z.string(),
    /** Which layer/provider produced it. */
    source: z.string(),
    payload: z.record(z.string(), z.unknown()),
    timestamp: IsoDateTime,
    severity: Severity,
    /** Monotonic per-run sequence for stable ordering. */
    sequence: z.number().int(),
});
export const AutomationRun = z.object({
    id: z.string(),
    triggerEventId: z.string(),
    runId: z.string().nullable(),
    purchasePlanId: z.string().nullable(),
    zapierHook: z.string(),
    status: z.enum(['sent', 'failed', 'unconfigured', 'pending_retry']),
    responseSummary: z.string(),
    executedAt: IsoDateTime,
    attempt: z.number().int(),
});
export const CreateRunRequest = z.object({
    intentId: z.string(),
    /** Re-run a specific stage from the given product set. */
    productIds: z.array(z.string()).optional(),
});
export const RunSnapshot = z.object({
    run: Run,
    intent: z.unknown().optional(),
    products: z.array(z.unknown()),
    evaluations: z.array(z.unknown()),
    shortlist: z.unknown().nullable(),
    plan: z.unknown().nullable(),
    approval: z.unknown().nullable(),
    payment: z.unknown().nullable(),
    automations: z.array(z.unknown()),
    events: z.array(AuditEvent),
    toolCalls: z.array(ToolCallRecord),
});
//# sourceMappingURL=events.js.map