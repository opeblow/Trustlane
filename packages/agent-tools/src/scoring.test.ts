import { describe, expect, it } from 'vitest';
import { buildIntent, parseIntentDeterministic } from './intent-parser.ts';
import { buildShortlist, evaluateProduct } from './scoring.ts';
import type { ProductT } from '@autopilot/schemas';

function attribute(key: string, label: string, value: number | null, unit?: string) {
  return {
    key,
    label,
    value,
    numericValue: value,
    unit,
    evidence: {
      kind: value === null ? ('unverified' as const) : ('provider_field' as const),
      source: 'test',
      confidence: value === null ? 0 : 0.9,
      observedAt: new Date().toISOString(),
    },
  };
}

function product(input: {
  id: string;
  title: string;
  price: number;
  ram: number | null;
  cpu: number | null;
  storage?: number;
  unverifiedGpu?: boolean;
  availability?: ProductT['availability']['status'];
}): ProductT {
  const now = new Date().toISOString();
  return {
    id: input.id,
    provider: 'test',
    externalId: input.id,
    title: input.title,
    category: 'laptop',
    price: { amount: input.price, currency: 'USD' },
    currency: 'USD',
    attributes: [
      attribute('ram_gb', 'Memory', input.ram, 'GB'),
      attribute('cpu_score', 'CPU benchmark score', input.cpu, 'pts'),
      attribute('storage_gb', 'Storage', input.storage ?? 1024, 'GB'),
      attribute('gpu_vram_gb', 'GPU memory', input.unverifiedGpu ? null : 16, 'GB'),
    ],
    availability: {
      status: input.availability ?? 'in_stock',
      observedAt: now,
    },
    sourceUrl: `https://example.invalid/${input.id}`,
    evidenceRefs: [
      {
        kind: 'provider_field',
        source: 'test',
        confidence: 0.9,
        observedAt: now,
      },
    ],
    retrievedAt: now,
  };
}

const intent = buildIntent({
  parsed: parseIntentDeterministic(
    'I need a laptop for ML development. Budget under $1,500. Minimum 32GB RAM. Prefer strong CPU performance.',
  ),
  rawText: 'laptop',
  engine: { name: 'deterministic', usedLlm: false },
});

describe('deterministic evaluation', () => {
  it('passes a fully compliant candidate with no disqualification', () => {
    const p = product({ id: 'p1', title: 'Pro 16', price: 1499, ram: 32, cpu: 24000 });
    const evaluation = evaluateProduct(intent, p);
    expect(evaluation.disqualified).toEqual([]);
    expect(evaluation.score).toBeGreaterThan(50);
    expect(evaluation.scoreBreakdown.map((c) => c.field)).toEqual([
      'constraints',
      'budget',
      'evidence',
      'availability',
      'value',
    ]);
  });

  it('disqualifies a candidate that misses a hard constraint', () => {
    const p = product({ id: 'p2', title: 'Cheap 8', price: 700, ram: 8, cpu: 9000 });
    const evaluation = evaluateProduct(intent, p);
    expect(evaluation.disqualified.length).toBeGreaterThan(0);
    expect(evaluation.disqualified.join(' ')).toContain('Memory');
    expect(evaluation.score).toBeLessThanOrEqual(40);
  });

  it('marks missing provider values as unverified instead of failing them', () => {
    const p = product({ id: 'p3', title: 'Unknown GPU', price: 1400, ram: 32, cpu: 22000, unverifiedGpu: true });
    const evaluation = evaluateProduct(intent, p);
    const gpu = evaluation.constraintResults.find((c) => c.field === 'gpu_vram_gb');
    expect(gpu?.satisfied).toBeNull();
    expect(evaluation.evidenceQuality.unverifiedFields).toContain('GPU memory');
    expect(evaluation.evidenceQuality.gaps.length).toBeGreaterThan(0);
  });

  it('is reproducible', () => {
    const p = product({ id: 'p4', title: 'Repeat', price: 1300, ram: 36, cpu: 25000 });
    const a = evaluateProduct(intent, p);
    const b = evaluateProduct(intent, p);
    expect(a.score).toBe(b.score);
    expect(a.scoreBreakdown).toEqual(b.scoreBreakdown);
  });

  it('ranks the stronger machine first and explains the gap', () => {
    const strong = product({ id: 'p5', title: 'Strong', price: 1450, ram: 32, cpu: 28000 });
    const decent = product({ id: 'p6', title: 'Decent', price: 1200, ram: 32, cpu: 18000 });
    const evaluations = [evaluateProduct(intent, decent), evaluateProduct(intent, strong)];
    const shortlist = buildShortlist({
      runId: 'run_1',
      intent,
      evaluations,
      products: [decent, strong],
    });

    expect(shortlist.entries[0]?.productId).toBe('p5');
    expect(shortlist.entries[0]?.rationale).toContain('Strong');
    expect(shortlist.explanation.length).toBeGreaterThanOrEqual(3);
    expect(shortlist.explanation.join(' ')).toContain('No hidden criteria');
  });

  it('keeps rejected candidates visible with reasons', () => {
    const bad = product({ id: 'p7', title: 'Bad', price: 2200, ram: 8, cpu: 4000 });
    const evaluation = evaluateProduct(intent, bad);
    const shortlist = buildShortlist({
      runId: 'run_2',
      intent,
      evaluations: [evaluation],
      products: [bad],
    });
    expect(shortlist.entries).toHaveLength(0);
    expect(shortlist.rejected).toHaveLength(1);
    expect(shortlist.rejected[0]?.failedConstraints.length).toBeGreaterThan(0);
  });
});