import { type ProviderHealthT } from '@autopilot/schemas';
export interface AutomationPayload {
    eventId: string;
    eventType: string;
    occurredAt: string;
    correlationId: string;
    runId: string | null;
    purchasePlanId: string | null;
    /** Only ever sent after the payment was independently verified. */
    verified: boolean;
    payment: {
        provider: string;
        mode: string;
        paypalOrderId: string;
        transactionId: string | null;
        amount: {
            amount: number;
            currency: string;
        };
        status: string;
        capturedAt: string | null;
    } | null;
    product: {
        id: string;
        title: string;
        merchant: string;
    } | null;
    policy: {
        policyId: string;
        policyVersion: number;
        outcome: string;
    } | null;
}
export interface AutomationDeliveryResult {
    status: 'sent' | 'failed' | 'unconfigured';
    hook: string;
    responseSummary: string;
    durationMs: number;
    httpStatus?: number;
}
export interface AutomationAdapter {
    health(): Promise<ProviderHealthT>;
    deliver(payload: AutomationPayload): Promise<AutomationDeliveryResult>;
    /** Optional dry-run used by POST /api/automations/test. */
    test(payload?: Partial<AutomationPayload>): Promise<AutomationDeliveryResult>;
}
/**
 * Zapier "Catch Hook" adapter. Post-purchase workflows fire from here, and only
 * ever after the payment has been independently verified by the backend.
 */
export declare class ZapierWebhookAdapter implements AutomationAdapter {
    private readonly config;
    constructor(config: {
        hookUrl?: string;
        timeoutMs?: number;
    });
    health(): Promise<ProviderHealthT>;
    deliver(payload: AutomationPayload): Promise<AutomationDeliveryResult>;
    test(payload?: Partial<AutomationPayload>): Promise<AutomationDeliveryResult>;
    private post;
}
export declare function redactHook(url: string): string;
export declare function createAutomationAdapter(config: {
    hookUrl?: string;
    timeoutMs?: number;
}): AutomationAdapter;
//# sourceMappingURL=adapter.d.ts.map