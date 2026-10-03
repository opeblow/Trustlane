import { type ApprovalT, type AuditEventT, type AutomationRunT, type EvaluationT, type EventTypeT, type IntentT, type PaymentT, type ProductT, type PurchasePlanT, type RunT, type ShortlistT, type ToolCallRecordT, type UserPolicyT } from '@autopilot/schemas';
import { type AutopilotDatabase } from './database.ts';
import { EventEmitter } from 'node:events';
export interface AutopilotStoreOptions {
    databasePath: string;
}
export interface EventQueryFilters {
    correlationId?: string;
    runId?: string;
    types?: string[];
    severities?: string[];
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
}
/**
 * Single store used by the API. Everything is persisted in SQLite (node:sqlite),
 * so the audit trail survives restarts and the product behaves like a real
 * service rather than an in-memory demo.
 */
export declare class AutopilotStore {
    readonly database: AutopilotDatabase;
    /** Emits `event` (AuditEvent) and `run` (Run) for SSE streaming. */
    readonly bus: EventEmitter<[never]>;
    constructor(options: AutopilotStoreOptions);
    get path(): string;
    close(): void;
    private exec;
    private all;
    private get;
    savePolicy(policy: UserPolicyT): UserPolicyT;
    getPolicy(id: string): UserPolicyT | undefined;
    getActivePolicy(): UserPolicyT | undefined;
    listPolicies(): UserPolicyT[];
    deactivatePolicies(): void;
    saveIntent(intent: IntentT): IntentT;
    getIntent(id: string): IntentT | undefined;
    saveRun(run: RunT): RunT;
    getRun(id: string): RunT | undefined;
    listRuns(limit?: number): RunT[];
    saveProduct(product: ProductT, context?: {
        runId?: string;
        intentId?: string;
    }): ProductT;
    getProduct(id: string): ProductT | undefined;
    listProductsByRun(runId: string): ProductT[];
    saveEvaluation(evaluation: EvaluationT, runId?: string): EvaluationT;
    listEvaluationsByRun(runId: string): EvaluationT[];
    saveShortlist(shortlist: ShortlistT): ShortlistT;
    getShortlistByRun(runId: string): ShortlistT | undefined;
    savePlan(plan: PurchasePlanT): PurchasePlanT;
    getPlan(id: string): PurchasePlanT | undefined;
    listPlansByRun(runId: string): PurchasePlanT[];
    saveApproval(approval: ApprovalT): ApprovalT;
    getApproval(id: string): ApprovalT | undefined;
    getApprovalByPlan(planId: string): ApprovalT | undefined;
    savePayment(payment: PaymentT): PaymentT;
    getPayment(id: string): PaymentT | undefined;
    getPaymentByPlan(planId: string): PaymentT | undefined;
    listPaymentsByRun(runId: string): PaymentT[];
    /** Sum of captured amounts inside the rolling window — used by the daily limit. */
    spentSince(sinceIso: string, currency: string): number;
    nextSequence(correlationId: string): number;
    appendEvent(input: {
        correlationId: string;
        runId?: string | null;
        type: EventTypeT;
        actor: string;
        source: string;
        payload?: Record<string, unknown>;
        severity?: 'info' | 'warn' | 'error';
        timestamp?: string;
    }): AuditEventT;
    queryEvents(filters?: EventQueryFilters): {
        total: number;
        events: AuditEventT[];
    };
    getEvent(id: string): AuditEventT | undefined;
    saveToolCall(record: ToolCallRecordT): ToolCallRecordT;
    listToolCalls(runId: string): ToolCallRecordT[];
    saveAutomation(automation: AutomationRunT): AutomationRunT;
    listAutomationsByRun(runId: string): AutomationRunT[];
    listAutomations(limit?: number): AutomationRunT[];
    findIdempotent<T>(key: string, endpoint: string): {
        statusCode: number;
        response: T;
    } | undefined;
    saveIdempotent(key: string, endpoint: string, statusCode: number, response: unknown): void;
    healthCheck(): boolean;
}
export declare function createStore(options: AutopilotStoreOptions): AutopilotStore;
//# sourceMappingURL=store.d.ts.map