import { sha256 } from '@autopilot/schemas';
/**
 * Local risk heuristics used when KERNEL credentials are absent.
 *
 * These are our own checks — they are labelled as Autopilot checks, never as a
 * KERNEL result — and they feed the risk flags shown on the purchase plan.
 */
export function deterministicRiskSignals(input) {
    const signals = [];
    if (input.policyOutcome === 'requires_approval' && !input.hasApproval) {
        signals.push({
            score: 0.5,
            label: 'Approval pending',
            detail: 'Policy requires explicit human approval and none has been recorded yet.',
        });
    }
    if (input.quoteAgeMinutes > 15) {
        signals.push({
            score: Math.min(1, input.quoteAgeMinutes / 120),
            label: 'Stale quote',
            detail: `Price quote is ${Math.round(input.quoteAgeMinutes)} minutes old; re-price before execution.`,
        });
    }
    if (input.amount >= 2000) {
        signals.push({
            score: 0.6,
            label: 'High value execution',
            detail: `Amount ${input.amount} is above the typical single-purchase threshold.`,
        });
    }
    if (input.policyVersion <= 1) {
        signals.push({
            score: 0.15,
            label: 'Unmodified policy',
            detail: 'The active policy has never been revised by the owner.',
        });
    }
    return signals;
}
export function summarizeSignals(signals) {
    if (signals.length === 0)
        return 'No risk signals detected by the deterministic checks.';
    const worst = [...signals].sort((a, b) => b.score - a.score)[0];
    return `${signals.length} signal${signals.length > 1 ? 's' : ''} detected; strongest: ${worst.label}.`;
}
/**
 * KERNEL adapter.
 *
 * The hackathon does not expose an open KERNEL API key, so this adapter calls a
 * configurable endpoint when credentials exist and otherwise falls back to the
 * local deterministic checks. Results from a live call are labelled `live: true`;
 * fallback results are labelled `live: false` so nothing is ever misrepresented.
 */
export class KernelAdapterImpl {
    config;
    constructor(config) {
        this.config = config;
    }
    async health() {
        if (!this.config.baseUrl) {
            return {
                provider: 'kernel',
                status: 'unconfigured',
                detail: 'KERNEL_BASE_URL is not configured. Purchase plans are still risk-assessed with Autopilot’s own deterministic checks; no KERNEL call is claimed.',
                checkedAt: nowIso(),
                requiresCredentials: true,
            };
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
            const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/health`, {
                headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
                signal: controller.signal,
            });
            clearTimeout(timer);
            return {
                provider: 'kernel',
                status: response.ok ? 'live' : 'degraded',
                detail: response.ok
                    ? 'KERNEL endpoint reachable.'
                    : `KERNEL endpoint responded with HTTP ${response.status}.`,
                checkedAt: new Date().toISOString(),
                endpoint: this.config.baseUrl,
                requiresCredentials: true,
            };
        }
        catch (error) {
            return {
                provider: 'kernel',
                status: 'degraded',
                detail: `KERNEL is configured but unreachable: ${error instanceof Error ? error.message : String(error)}`,
                checkedAt: new Date().toISOString(),
                endpoint: this.config.baseUrl,
                requiresCredentials: true,
            };
        }
    }
    async assess(input) {
        const fingerprint = sha256({
            correlationId: input.correlationId,
            amount: input.amount,
            currency: input.currency,
            merchant: input.merchant,
        });
        if (this.config.baseUrl) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
                const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/assess`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
                    },
                    body: JSON.stringify({ ...input, fingerprint }),
                    signal: controller.signal,
                });
                clearTimeout(timer);
                if (response.ok) {
                    const body = (await response.json());
                    const signals = body.signals ?? [];
                    return {
                        provider: 'kernel',
                        live: true,
                        riskScore: Number(body.riskScore ?? 0),
                        signals,
                        deterministicChecks: [],
                        summary: `KERNEL returned a risk score of ${body.riskScore ?? 0}.`,
                    };
                }
            }
            catch {
                /* fall through to deterministic checks */
            }
        }
        const deterministicChecks = deterministicRiskSignals({
            amount: input.amount,
            policyOutcome: input.policyOutcome,
            policyVersion: 1,
            quoteAgeMinutes: 0,
            approvalRequired: input.policyOutcome === 'requires_approval',
            hasApproval: false,
        });
        return {
            provider: 'kernel',
            live: false,
            riskScore: Number(Math.min(1, deterministicChecks.reduce((acc, s) => acc + s.score, 0)).toFixed(2)),
            signals: [],
            deterministicChecks,
            summary: `${summarizeSignals(deterministicChecks)} (Autopilot deterministic checks — no KERNEL call was made).`,
        };
    }
}
export function createKernelAdapter(config) {
    return new KernelAdapterImpl(config);
}
//# sourceMappingURL=adapter.js.map