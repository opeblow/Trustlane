import { type CurrencyCodeT, type UserPolicyT } from '@autopilot/schemas';
export interface DefaultPolicyOptions {
    id?: string;
    name?: string;
    currency?: CurrencyCodeT;
    maxTransaction?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
    requireApproval?: boolean;
    maxQuoteAgeMinutes?: number;
}
/**
 * A sane, deliberately conservative starting policy: nothing executes without
 * explicit human approval, and both the per-transaction and rolling limits are
 * tight enough that a runaway agent stops itself.
 */
export declare function defaultPolicy(options?: DefaultPolicyOptions): UserPolicyT;
export declare function bumpPolicyVersion(policy: UserPolicyT): UserPolicyT;
export declare function policyExpiryHint(): string;
//# sourceMappingURL=defaults.d.ts.map