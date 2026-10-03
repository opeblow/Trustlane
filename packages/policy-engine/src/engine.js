import { ageInMinutes, nowIso, sha256, toMinorUnits, newCorrelationId, } from '@autopilot/schemas';
const DEFAULTS = {
    suspiciousMultiple: 3,
    autoApproveFloor: 0,
};
function moneyEq(a, b) {
    return a.currency === b.currency && toMinorUnits(a.amount) === toMinorUnits(b.amount);
}
/**
 * Deterministic policy evaluation. No model, no network, no hidden criteria:
 * every rule either passes, warns or blocks, and the result is serialised into
 * the audit trail with the exact policy version that produced it.
 */
export function evaluatePolicy(request, policy, context = {}, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const rules = [];
    const correlationId = context.correlationId ?? request.correlationId ?? newCorrelationId();
    const evaluatedAt = nowIso();
    const requestedCurrency = request.currency ?? request.amount.currency;
    // 1. Kill switch first — it must win over everything else.
    rules.push({
        rule: 'emergency_stop',
        outcome: policy.emergencyStop ? 'block' : 'pass',
        message: policy.emergencyStop
            ? 'Emergency stop is active: every money-affecting action is blocked.'
            : 'Emergency stop is not active.',
        detail: { emergencyStop: policy.emergencyStop },
    });
    // 2. Currency must match the policy currency, otherwise the limits mean nothing.
    const currencyMatches = requestedCurrency === policy.currency && request.amount.currency === policy.currency;
    rules.push({
        rule: 'currency_match',
        outcome: currencyMatches ? 'pass' : 'block',
        message: currencyMatches
            ? `Currency ${policy.currency} matches the policy.`
            : `Policy is denominated in ${policy.currency}; the execution is in ${request.amount.currency}.`,
        detail: {
            policyCurrency: policy.currency,
            requestCurrency: request.amount.currency,
        },
    });
    const amountMinor = toMinorUnits(request.amount.amount);
    // 3. Single-transaction ceiling.
    const maxMinor = toMinorUnits(policy.maxTransaction.amount);
    rules.push({
        rule: 'max_transaction',
        outcome: currencyMatches && amountMinor > maxMinor ? 'block' : 'pass',
        message: currencyMatches && amountMinor > maxMinor
            ? `Amount ${request.amount.amount} ${policy.currency} exceeds the per-transaction limit of ${policy.maxTransaction.amount}.`
            : `Amount is within the per-transaction limit of ${policy.maxTransaction.amount}.`,
        detail: { amount: request.amount.amount, maxTransaction: policy.maxTransaction.amount },
    });
    // 4. Rolling daily limit.
    const spentMinor = context.spentInWindow ? toMinorUnits(context.spentInWindow.amount) : 0;
    const dailyMinor = toMinorUnits(policy.dailyLimit.amount);
    const projected = spentMinor + amountMinor;
    rules.push({
        rule: 'daily_limit',
        outcome: currencyMatches && projected > dailyMinor ? 'block' : 'pass',
        message: currencyMatches && projected > dailyMinor
            ? `This execution would bring the rolling 24h spend to ${(projected / 100).toFixed(2)} ${policy.currency}, above the ${policy.dailyLimit.amount} limit.`
            : `Projected rolling 24h spend ${(projected / 100).toFixed(2)} ${policy.currency} is within the ${policy.dailyLimit.amount} limit.`,
        detail: {
            spentInWindow: (spentMinor / 100).toFixed(2),
            projected: (projected / 100).toFixed(2),
            dailyLimit: policy.dailyLimit.amount,
            windowStartedAt: context.windowStartedAt ?? null,
        },
    });
    // 5. Category allow/deny lists.
    if (policy.blockedCategories.includes(request.category)) {
        rules.push({
            rule: 'blocked_category',
            outcome: 'block',
            message: `Category "${request.category}" is blocked by policy.`,
            detail: { category: request.category },
        });
    }
    else {
        rules.push({
            rule: 'blocked_category',
            outcome: 'pass',
            message: `Category "${request.category}" is not blocked.`,
            detail: { category: request.category },
        });
    }
    if (policy.allowedCategories !== null && !policy.allowedCategories.includes(request.category)) {
        rules.push({
            rule: 'allowed_category',
            outcome: 'block',
            message: `Policy only allows categories: ${policy.allowedCategories.join(', ')}.`,
            detail: { allowed: policy.allowedCategories },
        });
    }
    else {
        rules.push({
            rule: 'allowed_category',
            outcome: 'pass',
            message: policy.allowedCategories === null
                ? 'Policy does not restrict categories.'
                : `Category "${request.category}" is in the allowed list.`,
            detail: { allowed: policy.allowedCategories },
        });
    }
    // 6. Merchant block list.
    const merchant = request.merchant?.toLowerCase() ?? '';
    const blockedMerchant = merchant
        ? policy.blockedMerchants.some((m) => merchant.includes(m.toLowerCase()))
        : false;
    rules.push({
        rule: 'blocked_merchant',
        outcome: blockedMerchant ? 'block' : 'pass',
        message: blockedMerchant
            ? `Merchant "${request.merchant}" is on the block list.`
            : 'Merchant is not blocked.',
        detail: { merchant: request.merchant ?? null, blockedMerchants: policy.blockedMerchants },
    });
    // 7. Quote freshness — stale prices must be re-checked, never silently paid.
    if (request.quotedAt) {
        const age = ageInMinutes(request.quotedAt);
        const tooOld = age > policy.maxQuoteAgeMinutes;
        rules.push({
            rule: 'quote_freshness',
            outcome: tooOld ? 'warn' : 'pass',
            message: tooOld
                ? `Price quote is ${Math.round(age)} minutes old (limit ${policy.maxQuoteAgeMinutes}). The plan must be re-priced before execution.`
                : `Price quote is ${Math.round(age)} minutes old (limit ${policy.maxQuoteAgeMinutes}).`,
            detail: {
                ageMinutes: Number.isFinite(age) ? Math.round(age) : null,
                maxQuoteAgeMinutes: policy.maxQuoteAgeMinutes,
                quotedAt: request.quotedAt,
            },
        });
    }
    else {
        rules.push({
            rule: 'quote_freshness',
            outcome: 'warn',
            message: 'No provider price quote timestamp was supplied with this check.',
            detail: { quotedAt: null },
        });
    }
    // 8. Availability — never prepare an order for something we know is unavailable.
    const availability = request.availability ?? 'unknown';
    const unavailable = availability === 'out_of_stock' || availability === 'unknown';
    rules.push({
        rule: 'availability',
        outcome: unavailable ? 'block' : 'pass',
        message: unavailable
            ? `Product availability is "${availability}" — execution is blocked until availability is verified.`
            : `Product availability is "${availability}".`,
        detail: { availability },
    });
    // 9. Anomalous amount warning (warn only — the human still gets the final call).
    const suspiciousMultiple = maxMinor > 0 ? amountMinor / maxMinor : 0;
    rules.push({
        rule: 'suspicious_amount',
        outcome: suspiciousMultiple >= opts.suspiciousMultiple ? 'warn' : 'pass',
        message: suspiciousMultiple >= opts.suspiciousMultiple
            ? `Amount is ${suspiciousMultiple.toFixed(1)}x the configured per-transaction limit — flagged for explicit review.`
            : 'Amount is within the normal range for this policy.',
        detail: { multipleOfMax: Number(suspiciousMultiple.toFixed(2)) },
    });
    // 10. Approval requirement.
    const thresholdMinor = toMinorUnits(policy.approvalThreshold.amount);
    const needsApproval = policy.requireApproval || (currencyMatches && amountMinor >= thresholdMinor);
    rules.push({
        rule: 'approval_threshold',
        outcome: needsApproval ? 'warn' : 'pass',
        message: needsApproval
            ? policy.requireApproval
                ? 'Policy requires explicit human approval for every execution.'
                : `Amount ${request.amount.amount} ${policy.currency} is at or above the approval threshold ${policy.approvalThreshold.amount}.`
            : `Amount is below the approval threshold of ${policy.approvalThreshold.amount}.`,
        detail: {
            amount: request.amount.amount,
            approvalThreshold: policy.approvalThreshold.amount,
            requireApproval: policy.requireApproval,
        },
    });
    const blocked = rules.some((r) => r.outcome === 'block');
    const outcome = blocked
        ? 'deny'
        : needsApproval
            ? 'requires_approval'
            : 'allow';
    const inputHash = sha256({
        amount: request.amount,
        category: request.category,
        merchant: request.merchant ?? null,
        productId: request.productId ?? null,
        availability,
        spentInWindow: context.spentInWindow ?? null,
        policyVersion: policy.version,
    });
    return {
        policyId: policy.id,
        policyVersion: policy.version,
        outcome,
        approvalRequired: outcome === 'requires_approval',
        rules,
        evaluatedAt,
        inputHash,
        correlationId,
    };
}
export function blockingRules(decision) {
    return decision.rules.filter((r) => r.outcome === 'block');
}
export function warningRules(decision) {
    return decision.rules.filter((r) => r.outcome === 'warn');
}
export function summarizeDecision(decision) {
    const blockers = blockingRules(decision);
    if (blockers.length > 0) {
        return `Blocked by ${blockers.length} rule${blockers.length > 1 ? 's' : ''}: ${blockers
            .map((r) => r.rule)
            .join(', ')}.`;
    }
    if (decision.outcome === 'requires_approval') {
        return 'Allowed subject to explicit human approval.';
    }
    return 'Allowed by policy.';
}
export function decisionsMatch(a, b) {
    return a.inputHash === b.inputHash && a.policyVersion === b.policyVersion;
}
export function moneyOrZero(m, currency) {
    return m ?? { amount: 0, currency: currency };
}
export { moneyEq };
//# sourceMappingURL=engine.js.map