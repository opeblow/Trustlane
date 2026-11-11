import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { buildServer, type BuiltServer } from './server.ts';
import { loadEnv } from './env.ts';
import { LocalCatalogProvider } from '@autopilot/channel3';
import { defaultPolicy } from '@autopilot/policy-engine';

describe('API routes and webhooks', () => {
  let server: BuiltServer;

  beforeAll(async () => {
    // Set up server with local test env
    const env = loadEnv({
      NODE_ENV: 'test',
      PAYPAL_MODE: 'mock',
      CATALOG_PROVIDER: 'local',
      DATABASE_PATH: ':memory:',
    });
    server = await buildServer(env);

    // Seed reference products and default policy in test memory store
    const local = new LocalCatalogProvider();
    for (const product of local.all()) {
      server.services.store.saveProduct(product);
    }
    const policy = defaultPolicy({ id: 'policy_test', name: 'Test policy' });
    server.services.store.savePolicy(policy);
  });

  afterAll(async () => {
    server.services.close();
    await server.app.close();
  });

  it('GET /api/health returns 200 and healthy status', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.service).toBe('autopilot-api');
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.database.ok).toBe(true);
  });

  it('GET /api/health reports the active LLM provider for platform probes', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/health' });
    const body = res.json();
    expect(body.llm).toBe('deterministic');
    expect(body.mode).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/health reports a configured LLM provider when credentials exist', async () => {
    const llmServer = await buildServer(
      loadEnv({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', LLM_PROVIDER: 'openai', LLM_API_KEY: 'sk-test' }),
    );
    const res = await llmServer.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json().llm).toBe('openai');
    llmServer.services.close();
    await llmServer.app.close();
  });

  it('GET /api/openapi.json returns valid OpenAPI document', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/openapi.json',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.openapi).toBeDefined();
    expect(body.info.title).toBeDefined();
  });

  it('POST /api/intents and PATCH /api/intents/:intentId works with async resolution', async () => {
    const createRes = await server.app.inject({
      method: 'POST',
      url: '/api/intents',
      payload: {
        text: 'Procure 5 ergonomical chairs under $1200',
        currency: 'USD',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { intent } = createRes.json();
    expect(intent).toBeDefined();
    expect(intent.id).toBeDefined();

    // Verify PATCH works and returns resolved intent object (not Promise)
    const patchRes = await server.app.inject({
      method: 'PATCH',
      url: `/api/intents/${intent.id}`,
      payload: {
        budgetMax: { amount: 1500, currency: 'USD' },
        keywords: ['ergonomic', 'office'],
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json();
    expect(patched.intent.id).toBe(intent.id);
    expect(patched.intent.constraints.budgetMax.amount).toBe(1500);
  });

  it('POST /api/discovery/search finds products in catalog', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/discovery/search',
      payload: {
        query: 'monitor',
        limit: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.products).toBeInstanceOf(Array);
  });

  it('POST /api/policies/check evaluates a policy proposal', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/policies/check',
      payload: {
        amount: { amount: 150, currency: 'USD' },
        category: 'monitor',
        merchant: 'Dell Technologies',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision).toBeDefined();
    expect(body.decision.outcome).toBeDefined();
    expect(body.summary).toBeDefined();
  });

  it('GET /api/policies returns policy list', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/policies',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.policies).toBeInstanceOf(Array);
    expect(body.policies.length).toBeGreaterThan(0);
  });

  it('POST /api/automations/test tests webhook delivery without failing', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/automations/test',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(['sent', 'unconfigured', 'failed']).toContain(body.status);
  });

  it('GET /api/automations/history returns list of automations', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/automations/history',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.automations).toBeInstanceOf(Array);
  });

  it('GET /api/events returns audit events query result', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/events?limit=10',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toBeInstanceOf(Array);
  });

  it('runs the governed flow end to end: review → prepare → approve → capture → verify', async () => {
    const post = (url: string, payload: unknown) => server.app.inject({ method: 'POST', url, payload: payload as object });

    // The dashboard's default request: no product title contains "laptop".
    const intent = (await post('/api/intents', {
      text: 'Find me a work laptop under $1,500 with at least 16GB RAM. Ask me before you buy.',
    })).json().intent;
    expect(intent.constraints.budgetMax).toEqual({ amount: 1500, currency: 'USD' });
    expect(intent.constraints.budgetMin).toBeUndefined();

    const runRes = await post('/api/runs', { intentId: intent.id });
    expect(runRes.statusCode).toBe(201);
    const run = runRes.json().run;
    expect(run.status).toBe('completed');
    expect(run.shortlistedProductIds.length).toBeGreaterThan(0);

    const prepared = (await post('/api/purchases/prepare', { runId: run.id, productId: run.shortlistedProductIds[0] })).json();
    const plan = prepared.plan;
    expect(plan.status).toBe('awaiting_approval');

    // No approval, no money.
    const early = await post(`/api/purchases/${plan.id}/capture`, { planHash: plan.planHash });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('APPROVAL_REQUIRED');

    const approved = await post(`/api/purchases/${plan.id}/approve`, { planHash: plan.planHash });
    expect(approved.json().approval.status).toBe('approved');

    const captured = (await post(`/api/purchases/${plan.id}/capture`, { planHash: plan.planHash })).json();
    expect(captured.payment.status).toBe('captured');
    expect(captured.payment.verificationState).toBe('verified');
    expect(captured.plan.status).toBe('verified');

    // Replays must not charge, re-open the plan, or re-fire the automation.
    await post(`/api/purchases/${plan.id}/capture`, { planHash: plan.planHash });
    const reapproved = (await post(`/api/purchases/${plan.id}/approve`, { planHash: plan.planHash })).json();
    expect(reapproved.plan.status).toBe('verified');

    // A second run over the same catalog must not take the first run's candidates.
    await post('/api/runs', { intentId: intent.id });
    const detail = (await server.app.inject({ method: 'GET', url: `/api/runs/${run.id}` })).json();
    expect(detail.run.status).toBe('completed');
    expect(detail.products.length).toBeGreaterThan(0);
    expect(detail.automations).toHaveLength(1);
  });

  it('answers malformed JSON with 400, not 500', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/intents',
      payload: '{bad',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('enforces authentication when API token is configured', async () => {
    const authEnv = loadEnv({
      API_TOKEN: 'secret-test-token-12345',
      PAYPAL_MODE: 'mock',
      DATABASE_PATH: ':memory:',
    });
    const authServer = await buildServer(authEnv);

    // Request without token should return 401
    const unauthRes = await authServer.app.inject({
      method: 'GET',
      url: '/api/policies',
    });
    expect(unauthRes.statusCode).toBe(401);

    // Request with valid bearer token should succeed
    const authRes = await authServer.app.inject({
      method: 'GET',
      url: '/api/policies',
      headers: {
        authorization: 'Bearer secret-test-token-12345',
      },
    });
    expect(authRes.statusCode).toBe(200);

    authServer.services.close();
    await authServer.app.close();
  });
});
