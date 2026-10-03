import { type PolicyCheckRequestT, type PolicyDecisionT, type PolicyRuleResultT, type UserPolicyT } from '@autopilot/schemas';
export interface PolicyContext {
    /** Amount already committed (captured) in the rolling 24h window. */
    spentInWindow?: Money;
    /** Rolling window start, for display only. */
    windowStartedAt?: string;
    correlationId?: string;
}
export interface PolicyEngineOptions {
    /** Amounts above this multiple of the user's max transaction are flagged as suspicious. */
    suspiciousMultiple?: number;
    /** Below this fraction of the approval threshold, approval can be skipped by policy. */
    autoApproveFloor?: number;
}
declare function moneyEq(a: Money, b: Money): boolean;
/**
 * Deterministic policy evaluation. No model, no network, no hidden criteria:
 * every rule either passes, warns or blocks, and the result is serialised into
 * the audit trail with the exact policy version that produced it.
 */
export declare function evaluatePolicy(request: PolicyCheckRequestT, policy: UserPolicyT, context?: PolicyContext, options?: PolicyEngineOptions): PolicyDecisionT;
export declare function blockingRules(decision: PolicyDecisionT): PolicyRuleResultT[];
export declare function warningRules(decision: PolicyDecisionT): PolicyRuleResultT[];
export declare function summarizeDecision(decision: PolicyDecisionT): string;
export declare function decisionsMatch(a: PolicyDecisionT, b: PolicyDecisionT): boolean;
export declare function moneyOrZero(m: Money | undefined, currency: string): Money;
export { moneyEq };
//# sourceMappingURL=engine.d.ts.map