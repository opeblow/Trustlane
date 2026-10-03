import { isoPlusDays, newId, nowIso } from '@autopilot/schemas';
/**
 * A sane, deliberately conservative starting policy: nothing executes without
 * explicit human approval, and both the per-transaction and rolling limits are
 * tight enough that a runaway agent stops itself.
 */
export function defaultPolicy(options = {}) {
    const currency = options.currency ?? 'USD';
    return {
        id: options.id ?? newId('pol'),
        name: options.name ?? 'Personal guardrails',
        currency,
        maxTransaction: { amount: options.maxTransaction ?? 2000, currency },
        dailyLimit: { amount: options.dailyLimit ?? 3000, currency },
        approvalThreshold: { amount: options.approvalThreshold ?? 250, currency },
        requireApproval: options.requireApproval ?? true,
        blockedCategories: [],
        allowedCategories: null,
        blockedMerchants: [],
        maxQuoteAgeMinutes: options.maxQuoteAgeMinutes ?? 15,
        emergencyStop: false,
        version: 1,
        updatedAt: nowIso(),
    };
}
export function bumpPolicyVersion(policy) {
    return { ...policy, version: policy.version + 1, updatedAt: nowIso() };
}
export function policyExpiryHint() {
    return isoPlusDays(0);
}
//# sourceMappingURL=defaults.js.map