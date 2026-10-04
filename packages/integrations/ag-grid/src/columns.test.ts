import { describe, expect, it } from 'vitest';
import type { EvaluationT, NumericConstraintT, ProductT } from '@autopilot/schemas';

import {
  buildColumns,
  constraintFromGridEdit,
  constraintsToGridFilters,
  rowsFromEvaluations,
  summariseConstraintResults,
} from './columns.ts';

function attribute(key: string, value: number | null) {
  return {
    key,
    label: key,
    value,
    numericValue: value,
    unit: 'GB',
    evidence: {
      kind: value === null ? ('unverified' as const) : ('provider_field' as const),
      source: 'test',
      confidence: value === null ? 0 : 0.9,
      observedAt: new Date().toISOString(),
    },
  };
}

function product(id: string, ram: number | null, price: number): ProductT {
  return {
    id,
    provider: 'test',
    externalId: id,
    title: `Product ${id}`,
    brand: 'Test',
    category: 'laptop',
    price: { amount: price, currency: 'USD' },
    currency: 'USD',
    attributes: [attribute('ram_gb', ram), attribute('gpu_vram_gb', null)],
    availability: { status: 'in_stock', observedAt: new Date().toISOString() },
    retrievedAt: new Date().toISOString(),
    sourceUrl: 'https://example.invalid',
    raw: {},
  } as ProductT;
}

function evaluation(productId: string, score: number, rank?: number): EvaluationT {
  return {
    id: `eval_${productId}`,
    intentId: 'int_1',
    productId,
    constraintResults: [
      { field: 'ram_gb', label: 'Memory', op: 'gte', expected: '16', actual: '32', satisfied: true, hard: true },
    ],
    evidenceQuality: { score: 0.9, verifiedFields: ['ram_gb'], unverifiedFields: ['gpu_vram_gb'], gaps: ['gpu_vram_gb'] },
    tradeoffs: [
      { aspect: 'price', direction: 'pro', detail: 'cheaper', weight: 0.4 },
      { aspect: 'weight', direction: 'con', detail: 'heavier', weight: 0.2 },
    ],
    score,
    scoreBreakdown: [],
    disqualified: [],
    modelVersion: 'test',
    ...(rank === undefined ? {} : { rank }),
    createdAt: new Date().toISOString(),
  };
}

describe('buildColumns', () => {
  it('returns base, attribute and score columns with unique column ids', () => {
    const columns = buildColumns();
    const ids = columns.map((column) => column.colId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(columns[0]?.colId).toBe('rank');
    expect(ids).toContain('ram_gb');
    expect(ids).toContain('evidenceScore');
  });

  it('honours an explicit attribute key subset', () => {
    const columns = buildColumns({ attributeKeys: ['ram_gb', 'unknown_key'] });
    expect(columns.filter((column) => column.field.startsWith('attributes.')).map((column) => column.colId)).toEqual([
      'ram_gb',
    ]);
  });
});

describe('constraint filters', () => {
  const intent = {
    id: 'int_1',
    constraints: {
      numeric: [
        { field: 'ram_gb', label: 'Memory', op: 'gte', value: 16, source: 'user', weight: 1, hard: true },
        { field: 'price', label: 'Price', op: 'lte', value: 1500, source: 'user', weight: 1, hard: true },
      ] as NumericConstraintT[],
      keywords: [],
      preferences: [],
    },
  } as unknown as Parameters<typeof constraintsToGridFilters>[0][number];

  it('produces a grid filter for every numeric constraint', () => {
    expect(constraintsToGridFilters(intent.constraints.numeric)).toEqual([
      { field: 'attributes.ram_gb', operator: 'greaterThanOrEqual', value: 16 },
      { field: 'price', operator: 'lessThanOrEqual', value: 1500 },
    ]);
  });

  it('keeps the filter field aligned with a real column id', () => {
    const colIds = new Set(buildColumns().map((column) => column.colId));
    for (const filter of constraintsToGridFilters(intent.constraints.numeric)) {
      const colId = filter.field.startsWith('attributes.') ? filter.field.slice('attributes.'.length) : filter.field;
      if (colId === 'price') {
        expect(colIds.has('price')).toBe(true);
        continue;
      }
      expect(colIds.has(colId)).toBe(true);
    }
  });

  it('round-trips a grid cell edit back into a constraint', () => {
    const constraint = constraintFromGridEdit({
      field: 'attributes.ram_gb',
      op: 'greaterThanOrEqual',
      value: 32,
      intent: intent as Parameters<typeof constraintFromGridEdit>[0]['intent'],
    });
    expect(constraint).toEqual({
      field: 'ram_gb',
      label: 'Memory',
      op: 'gte',
      value: 32,
      unit: undefined,
      source: 'user',
      weight: 1,
      hard: true,
    });
  });
});

describe('rowsFromEvaluations', () => {
  it('ranks rows, flags unverified attributes and keeps pinned products first', () => {
    const rows = rowsFromEvaluations({
      products: [product('a', 32, 1200), product('b', null, 900), product('c', 64, 2000)],
      evaluations: [evaluation('a', 70, 2), evaluation('b', 95), evaluation('c', 88, 1)],
      pinnedProductIds: ['c'],
    });

    expect(rows.map((row) => row.productId)).toEqual(['c', 'a', 'b']);
    expect(rows[0]?.pinned).toBe(true);
    expect(rows[2]?.evidence.ram_gb).toBe('unverified');
    expect(rows[2]?.unverifiedCount).toBe(1);
    expect(rows[0]?.tradeoffs).toEqual({ pro: 1, con: 1 });
  });

  it('summarises failing and unknown constraint results', () => {
    const results = summariseConstraintResults([
      { field: 'ram_gb', label: 'Memory', op: 'gte', expected: '16', actual: '8', satisfied: false, hard: true },
      { field: 'gpu_vram_gb', label: 'GPU memory', op: 'gte', expected: '8', actual: null, satisfied: null, hard: true },
      { field: 'price', label: 'Price', op: 'lte', expected: '1500', actual: '1200', satisfied: true, hard: true },
    ]);
    expect(results).toBe('fails Memory; has unverified GPU memory');
  });
});