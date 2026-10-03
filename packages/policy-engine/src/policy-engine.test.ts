import { describe, expect, it } from 'vitest';
import { defaultPolicy, evaluatePolicy, summarizeDecision } from './index.ts';
import { isoPlusMinutes, nowIso, type PolicyCheckRequestT } from '@autopilot/schemas';

function request(overrides: Partial<PolicyCheckRequestT> = {}): PolicyCheckRequestT {
  return {
    amount: { amount: 1499, currency: 'USD' },
    category: 'laptop',
    availability: 'in_stock',
    quotedAt: nowIso(),
    ...overrides,
  };
}

describe('policy engine', () => {
  it('allows a compliant purchase but still demands approval when the policy requires it', () => {
    const policy = defaultPolicy({ requireApproval: true });
    const decision = evaluatePolicy(request(), policy);

    expect(decision.outcome).toBe('requires_approval');
    expect(decision.approvalRequired).toBe(true);
    expect(decision.rules.every((r) => r.outcome !== 'block')).toBe(true);
    expect(decision.policyVersion).toBe(1);
  });

  it('allows without approval for small amounts when the policy does not require it', () => {
    const policy = defaultPolicy({ requireApproval: false, approvalThreshold: 250 });
    const decision = evaluatePolicy(
      request({ amount: { amount: 49.99, currency: 'USD' } }),
      policy,
    );
    expect(decision.outcome).toBe('allow');
  });

  it('blocks above the per-transaction limit', () => {
    const policy = defaultPolicy({ maxTransaction: 1000 });
    const decision = evaluatePolicy(
      request({ amount: { amount: 1000.01, currency: 'USD' } }),
      policy,
    );
    expect(decision.outcome).toBe('deny');
    const blocked = decision.rules.filter((r) => r.outcome === 'block').map((r) => r.rule);
    expect(blocked).toContain('max_transaction');
    expect(summarizeDecision(decision)).toContain('max_transaction');
  });

  it('blocks when the rolling 24h spend would be exceeded', () => {
    const policy = defaultPolicy({ dailyLimit: 1000 });
    const decision = evaluatePolicy(request({ amount: { amount: 300, currency: 'USD' } }), policy, {
      spentInWindow: { amount: 800, currency: 'USD' },
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.rules.find((r) => r.rule === 'daily_limit')?.outcome).toBe('block');
  });

  it('blocks blocked categories and disallowed merchants', () => {
    const policy = { ...defaultPolicy(), blockedCategories: ['audio' as const] };
    const blocked = evaluatePolicy(request({ category: 'audio' }), policy);
    expect(blocked.outcome).toBe('deny');

    const merchantPolicy = { ...defaultPolicy(), blockedMerchants: ['shady-outlet'] };
    const merchant = evaluatePolicy(request({ merchant: 'Shady-Outlet Inc' }), merchantPolicy);
    expect(merchant.outcome).toBe('deny');
    expect(merchant.rules.find((r) => r.rule === 'blocked_merchant')?.outcome).toBe('block');
  });

  it('blocks when the policy currency does not match the execution currency', () => {
    const policy = defaultPolicy({ currency: 'USD' });
    const decision = evaluatePolicy(
      request({ amount: { amount: 100, currency: 'EUR' } }),
      policy,
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.rules.find((r) => r.rule === 'currency_match')?.outcome).toBe('block');
  });

  it('honours the emergency stop above every other rule', () => {
    const policy = { ...defaultPolicy(), emergencyStop: true };
    const decision = evaluatePolicy(request({ amount: { amount: 1, currency: 'USD' } }), policy);
    expect(decision.outcome).toBe('deny');
    expect(decision.rules.find((r) => r.rule === 'emergency_stop')?.outcome).toBe('block');
  });

  it('warns (never silently passes) on a stale quote', () => {
    const policy = defaultPolicy({ maxQuoteAgeMinutes: 15 });
    const decision = evaluatePolicy(
      request({ quotedAt: isoPlusMinutes(-120) }),
      policy,
    );
    const freshness = decision.rules.find((r) => r.rule === 'quote_freshness');
    expect(freshness?.outcome).toBe('warn');
    expect(decision.rules.find((r) => r.rule === 'max_transaction')?.outcome).toBe('pass');
  });

  it('blocks unverified availability', () => {
    const policy = defaultPolicy();
    const decision = evaluatePolicy(request({ availability: 'unknown' }), policy);
    expect(decision.outcome).toBe('deny');
    expect(decision.rules.find((r) => r.rule === 'availability')?.outcome).toBe('block');
  });

  it('produces a stable input hash that changes with the amount', () => {
    const policy = defaultPolicy();
    const a = evaluatePolicy(request({ amount: { amount: 10, currency: 'USD' } }), policy);
    const b = evaluatePolicy(request({ amount: { amount: 11, currency: 'USD' } }), policy);
    const c = evaluatePolicy(request({ amount: { amount: 10, currency: 'USD' } }), policy);
    expect(a.inputHash).toBe(c.inputHash);
    expect(a.inputHash).not.toBe(b.inputHash);
  });

  it('flags anomalous amounts as a warning, not an automatic block', () => {
    const policy = defaultPolicy({ maxTransaction: 1000 });
    const decision = evaluatePolicy(request({ amount: { amount: 3500, currency: 'USD' } }), policy);
    const suspicious = decision.rules.find((r) => r.rule === 'suspicious_amount');
    expect(suspicious?.outcome).toBe('warn');
  });
});