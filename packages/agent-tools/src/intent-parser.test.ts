import { describe, expect, it } from 'vitest';
import { buildIntent, parseIntentDeterministic } from './intent-parser.ts';

const REQUEST =
  'I need a laptop for ML development. Budget under $1,500. Minimum 32GB RAM. Prefer strong CPU performance. Do not buy anything without my approval.';

describe('deterministic intent parser', () => {
  it('extracts the golden-demo request correctly', () => {
    const parsed = parseIntentDeterministic(REQUEST);

    expect(parsed.category).toBe('laptop');
    expect(parsed.budgetMax).toBe(1500);
    expect(parsed.requireApproval).toBe(true);
    expect(parsed.approvalMentioned).toBe(true);

    const ram = parsed.numeric.find((c) => c.field === 'ram_gb');
    expect(ram).toBeDefined();
    expect(ram?.op).toBe('gte');
    expect(ram?.value).toBe(32);

    const cpu = parsed.numeric.find((c) => c.field === 'cpu_score');
    expect(cpu).toBeDefined();
    expect(cpu?.source).toBe('inferred');
    expect(cpu?.hard).toBe(false);
  });

  it('is deterministic for identical input', () => {
    expect(parseIntentDeterministic(REQUEST)).toEqual(parseIntentDeterministic(REQUEST));
  });

  it('parses non-USD currencies from the symbol', () => {
    const parsed = parseIntentDeterministic('A monitor under €600 with at least 27 inch screen');
    expect(parsed.currency).toBe('EUR');
    expect(parsed.budgetMax).toBe(600);
    expect(parsed.category).toBe('monitor');
  });

  it('treats "at most" as a ceiling and "at least" as a floor', () => {
    const parsed = parseIntentDeterministic('laptop with at most 16GB RAM and at least 1TB storage');
    const ram = parsed.numeric.find((c) => c.field === 'ram_gb');
    const storage = parsed.numeric.find((c) => c.field === 'storage_gb');
    expect(ram?.op).toBe('lte');
    expect(ram?.value).toBe(16);
    expect(storage?.op).toBe('gte');
    expect(storage?.value).toBe(1000);
  });

  it('honours a standing approval instruction but still records the intent', () => {
    const parsed = parseIntentDeterministic('headphones under $200, you have approval to buy');
    expect(parsed.requireApproval).toBe(false);
    expect(parsed.approvalMentioned).toBe(true);
  });

  it('defaults to requiring approval when the request is silent', () => {
    const parsed = parseIntentDeterministic('a cheap mechanical keyboard under $150');
    expect(parsed.requireApproval).toBe(true);
    expect(parsed.approvalMentioned).toBe(false);
  });

  it('surfaces open questions instead of guessing', () => {
    const parsed = parseIntentDeterministic('something nice for work');
    expect(parsed.openQuestions.length).toBeGreaterThan(0);
    expect(parsed.confidence).toBeLessThan(0.7);
  });

  it('builds an intent whose approval flag can be overridden by policy', () => {
    const parsed = parseIntentDeterministic(REQUEST);
    const intent = buildIntent({
      parsed,
      rawText: REQUEST,
      engine: { name: 'deterministic', usedLlm: false },
      requireApprovalOverride: true,
    });
    expect(intent.approvalRequired).toBe(true);
    expect(intent.constraints.budgetMax).toEqual({ amount: 1500, currency: 'USD' });
    expect(intent.status).toBe('interpreted');
  });
});