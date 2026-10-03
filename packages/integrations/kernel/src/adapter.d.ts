import { type ProviderHealthT } from '@autopilot/schemas';
export interface KernelRiskSignal {
    /** 0..1 — how strongly the signal suggests something unusual. */
    score: number;
    label: string;
    detail: string;
}
export interface KernelAssessment {
    provider: 'kernel';
    /** True only when a real KERNEL call produced this assessment. */
    live: boolean;
    riskScore: number;
    signals: KernelRiskSignal[];
    /** Deterministic checks Autopilot always runs, regardless of KERNEL access. */
    deterministicChecks: KernelRiskSignal[];
    summary: string;
}
export interface KernelAdapter {
    health(): Promise<ProviderHealthT>;
    assess(input: {
        correlationId: string;
        amount: number;
        currency: string;
        category: string;
        merchant: string;
        productTitle: string;
        policyOutcome: string;
    }): Promise<KernelAssessment>;
}
/**
 * Local risk heuristics used when KERNEL credentials are absent.
 *
 * These are our own checks — they are labelled as Autopilot checks, never as a
 * KERNEL result — and they feed the risk flags shown on the purchase plan.
 */
export declare function deterministicRiskSignals(input: {
    amount: number;
    policyOutcome: string;
    policyVersion: number;
    quoteAgeMinutes: number;
    approvalRequired: boolean;
    hasApproval: boolean;
}): KernelRiskSignal[];
export declare function summarizeSignals(signals: KernelRiskSignal[]): string;
/**
 * KERNEL adapter.
 *
 * The hackathon does not expose an open KERNEL API key, so this adapter calls a
 * configurable endpoint when credentials exist and otherwise falls back to the
 * local deterministic checks. Results from a live call are labelled `live: true`;
 * fallback results are labelled `live: false` so nothing is ever misrepresented.
 */
export declare class KernelAdapterImpl implements KernelAdapter {
    private readonly config;
    constructor(config: {
        baseUrl?: string;
        apiKey?: string;
        timeoutMs?: number;
    });
    health(): Promise<ProviderHealthT>;
    assess(input: {
        correlationId: string;
        amount: number;
        currency: string;
        category: string;
        merchant: string;
        productTitle: string;
        policyOutcome: string;
    }): Promise<KernelAssessment>;
}
export declare function createKernelAdapter(config: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
}): KernelAdapter;
//# sourceMappingURL=adapter.d.ts.map