import type { OperationSpec } from '@autopilot/apimatic';

export interface OperationExample {
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Assertion used by the built-in runner and mirrored into Postman tests. */
  expectStatus?: number | string;
  /** Extract post-response values into collection variables. */
  capture?: Array<{ variable: string; pointer: string }>;
}

/**
 * Concrete, runnable examples for every mutating or state-dependent operation.
 * They double as the Golden Path contract test.
 */
export const EXAMPLES: Record<string, OperationExample> = {
  createIntent: {
    body: {
      message: 'Buy the best-value laptop under $1200 with at least 16GB RAM',
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
    },
    expectStatus: 201,
    capture: [
      { variable: 'intentId', pointer: 'intent.id' },
      { variable: 'productId', pointer: 'intent.constraints.productHints' },
    ],
  },
  updateIntent: {
    pathParams: { intentId: '{{intentId}}' },
    body: {
      numeric: [
        {
          field: 'ram_gb',
          label: 'Memory (GB)',
          op: 'gte',
          value: 32,
          unit: 'GB',
          source: 'user',
          weight: 1,
          hard: true,
        },
      ],
      categories: ['laptop'],
    },
    expectStatus: 200,
  },
  createRun: {
    body: { intentId: '{{intentId}}' },
    expectStatus: 201,
    capture: [{ variable: 'runId', pointer: 'run.id' }],
  },
  getRun: {
    pathParams: { runId: '{{runId}}' },
    expectStatus: 200,
  },
  listRuns: {
    query: { limit: '20', status: 'all' },
    expectStatus: 200,
  },
  getRunEvents: {
    pathParams: { runId: '{{runId}}' },
    expectStatus: 200,
  },
  getRunToolCalls: {
    pathParams: { runId: '{{runId}}' },
    expectStatus: 200,
  },
  searchDiscovery: {
    body: {
      query: 'laptop',
      category: 'laptop',
      budget: { amount: 1200, currency: 'USD' },
      constraints: [{ field: 'ram_gb', op: 'gte', value: 16 }],
      limit: 12,
    },
    expectStatus: 200,
  },
  getProduct: {
    pathParams: { productId: '{{productId}}' },
    expectStatus: 200,
  },
  evaluateCandidates: {
    body: { intentId: '{{intentId}}', runId: '{{runId}}' },
    expectStatus: 200,
  },
  checkPolicy: {
    body: {
      amount: { amount: 1199, currency: 'USD' },
      category: 'laptop',
      merchant: 'refurb-tech',
      productTitle: 'Aurora 14 (Reference)',
      hasApproval: false,
      intentCategory: 'laptop',
      quoteAgeMinutes: 1,
      intentId: '{{intentId}}',
    },
    expectStatus: 200,
  },
  listPolicies: { expectStatus: 200 },
  upsertPolicy: {
    body: {
      name: 'Default — $1500 hard cap',
      owner: 'founder',
      maxAmount: { amount: 1500, currency: 'USD' },
      approvalThreshold: { amount: 250, currency: 'USD' },
      blockedCategories: ['audio'],
      requiresApprovalAbove: { amount: 250, currency: 'USD' },
      maxQuoteAgeMinutes: 15,
      allowedMccs: [],
      allowedMerchantIds: [],
    },
    expectStatus: 200,
  },
  preparePurchase: {
    headers: { 'Idempotency-Key': 'prepare-{{runId}}' },
    body: { runId: '{{runId}}' },
    expectStatus: 200,
    capture: [
      { variable: 'planId', pointer: 'plan.id' },
      { variable: 'planHash', pointer: 'plan.planHash' },
    ],
  },
  getPurchase: {
    pathParams: { planId: '{{planId}}' },
    expectStatus: 200,
  },
  approvePurchase: {
    pathParams: { planId: '{{planId}}' },
    headers: { 'Idempotency-Key': 'approve-{{planId}}' },
    body: {
      planHash: '{{planHash}}',
      amount: { amount: 1199, currency: 'USD' },
      approvedBy: 'founder',
      attestation: 'I reviewed the price, merchant and policy outcome shown on screen.',
    },
    expectStatus: 200,
  },
  capturePurchase: {
    pathParams: { planId: '{{planId}}' },
    headers: { 'Idempotency-Key': 'capture-{{planId}}' },
    body: { planHash: '{{planHash}}', simulatedApproval: true },
    expectStatus: 200,
    capture: [{ variable: 'paymentId', pointer: 'payment.id' }],
  },
  getPayment: {
    pathParams: { paymentId: '{{paymentId}}' },
    expectStatus: 200,
  },
  testAutomation: {
    body: { purchasePlanId: '{{planId}}' },
    expectStatus: 200,
  },
  searchEvents: {
    query: { q: 'policy', limit: '25' },
    expectStatus: 200,
  },
  getEvent: {
    pathParams: { eventId: 'evt_nonexistent' },
    expectStatus: 404,
  },
  getHealth: { expectStatus: 200 },
  getOpenApi: { expectStatus: 200 },
};

export function exampleFor(operation: OperationSpec): OperationExample {
  return EXAMPLES[operation.operationId] ?? {};
}