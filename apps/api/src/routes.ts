import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ApprovePurchaseRequest,
  CapturePurchaseRequest,
  CatalogSearchRequest,
  CreateIntentRequest,
  CreateRunRequest,
  EvaluateRequest,
  EventQuery,
  PolicyCheckRequest,
  PreparePurchaseRequest,
  UpdateIntentConstraintsRequest,
  UpsertPolicyRequest,
  isoPlusDays,
  money,
  newId,
  nowIso,
  toMinorUnits,
  type AuditEventT,
  type RunT,
  type UserPolicyT,
} from '@autopilot/schemas';
import { buildOpenApiDocument } from '@autopilot/apimatic';
import { bumpPolicyVersion, evaluatePolicy, summarizeDecision } from '@autopilot/policy-engine';
import { searchWithFallback } from '@autopilot/channel3';
import { ApiHttpError, errorBody, errors } from './errors.ts';
import type { Services } from './services/container.ts';
import {
  createIntent,
  evaluateIntent,
  runDetail,
  startRun,
  updateIntent,
} from './services/runs.ts';
import {
  approvePurchase,
  capturePurchase,
  preparePurchase,
} from './services/purchases.ts';
import { callTool, createToolRegistry, deliverAutomation } from './services/tools.ts';

export interface RouteOptions {
  services: Services;
}

export async function registerRoutes(app: FastifyInstance, options: RouteOptions): Promise<void> {
  const { services } = options;
  const store = services.store;
  /** Prepare calls currently executing, by idempotency key + request scope. */
  const preparing = new Map<string, Promise<Awaited<ReturnType<typeof preparePurchase>>>>();

  // ----------------------------------------------------------------- intents

  app.post('/api/intents', async (request, reply) => {
    const body = parse(CreateIntentRequest, request.body);
    const { intent } = await createIntent(services, {
      text: body.text,
      ...(body.currency ? { currency: body.currency } : {}),
      ...(body.requireApproval !== undefined ? { requireApproval: body.requireApproval } : {}),
    });
    return reply.code(201).send({ intent });
  });

  app.patch('/api/intents/:intentId', async (request) => {
    const intentId = param(request, 'intentId');
    const body = parse(UpdateIntentConstraintsRequest, request.body);
    // BUG FIX: updateIntent is async — was missing await, returning a Promise instead of the intent.
    const intent = await updateIntent(services, intentId, {
      ...(body.numeric ? { numeric: body.numeric } : {}),
      ...(body.keywords ? { keywords: body.keywords } : {}),
      ...(body.preferences ? { preferences: body.preferences } : {}),
      ...(body.budgetMax ? { budgetMax: body.budgetMax } : {}),
      ...(body.budgetMin ? { budgetMin: body.budgetMin } : {}),
      ...(body.requireApproval !== undefined ? { requireApproval: body.requireApproval } : {}),
    });
    return { intent };
  });

  // -------------------------------------------------------------------- runs

  app.post('/api/runs', async (request, reply) => {
    const body = parse(CreateRunRequest, request.body);
    const run = await startRun(services, { intentId: body.intentId });
    if (run.status === 'blocked' && run.candidateCount === 0) {
      // The run is persisted and fully auditable even when it cannot proceed.
      throw errors.conflict(
        'NO_CANDIDATES',
        run.blockedReason ?? 'No candidates matched this request.',
        { runId: run.id, runStatus: run.status },
      );
    }
    // A run blocked by policy still carries its evaluated shortlist, so it is
    // returned as a normal run with status "blocked" rather than as an error.
    return reply.code(201).send({ run });
  });

  app.get('/api/runs', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));
    return { runs: store.listRuns(limit) };
  });

  app.get('/api/runs/:runId', async (request) => {
    const runId = param(request, 'runId');
    return runDetail(services, runId);
  });

  app.get('/api/runs/:runId/events', async (request) => {
    const runId = param(request, 'runId');
    const run = store.getRun(runId);
    if (!run) throw errors.notFound(`Run ${runId}`);
    return store.queryEvents({ correlationId: run.correlationId, limit: 200 }).events;
  });

  app.get('/api/runs/:runId/tool-calls', async (request) => {
    const runId = param(request, 'runId');
    const run = store.getRun(runId);
    if (!run) throw errors.notFound(`Run ${runId}`);
    return { toolCalls: store.listToolCalls(runId) };
  });

  app.get('/api/runs/:runId/stream', async (request, reply) => {
    const runId = param(request, 'runId');
    const run = store.getRun(runId);
    if (!run) throw errors.notFound(`Run ${runId}`);

    // Writing to the raw socket bypasses Fastify's reply, so the headers the
    // CORS plugin already put on it are carried over by hand; without them a
    // browser on another origin cannot open the stream.
    const inherited = reply.getHeaders() as Record<string, string | number | string[]>;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...inherited,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('run', runDetail(services, runId).run);

    const onEvent = (event: AuditEventT) => {
      if (event.runId === runId || event.correlationId === run.correlationId) send('event', event);
    };
    const onRun = (updated: RunT) => {
      if (updated.id === runId) send('run', updated);
    };
    store.bus.on('event', onEvent);
    store.bus.on('run', onRun);

    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 15_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      store.bus.off('event', onEvent);
      store.bus.off('run', onRun);
    };
    request.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
    return reply;
  });

  // --------------------------------------------------------------- discovery

  app.post('/api/discovery/search', async (request) => {
    const body = parse(CatalogSearchRequest, request.body);
    const result = await searchWithFallback(services.catalog, body);
    for (const product of result.products) {
      store.saveProduct(product);
    }
    return result;
  });

  app.get('/api/products/:productId', async (request) => {
    const productId = param(request, 'productId');
    const started = Date.now();
    const product =
      store.getProduct(productId) ?? (await services.catalog.primary.details(productId));
    if (!product) throw errors.notFound(`Product ${productId}`);
    store.saveProduct(product);
    return { product, provider: product.provider, tookMs: Date.now() - started };
  });

  // -------------------------------------------------------------- evaluation

  app.post('/api/evaluations', async (request) => {
    const body = parse(EvaluateRequest, request.body);
    const result = evaluateIntent(services, body);
    const run = body.runId ? store.getRun(body.runId) : undefined;
    return {
      runId: body.runId ?? null,
      provider: result.products[0]?.provider ?? services.catalog.primary.name,
      degraded: result.products.length === 0,
      tookMs: 0,
      products: result.products,
      evaluations: result.evaluations,
      shortlist: result.shortlist,
      correlationId: run?.correlationId ?? null,
    };
  });

  // ------------------------------------------------------------------ policy

  app.post('/api/policies/check', async (request) => {
    const body = parse(PolicyCheckRequest, request.body);
    const policy = body.policyId ? store.getPolicy(body.policyId) ?? services.activePolicy() : services.activePolicy();
    const spent = store.spentSince(isoPlusDays(-1), policy.currency);
    const decision = evaluatePolicy(body, policy, {
      spentInWindow: money(spent, policy.currency),
    });
    return { decision, policy, summary: summarizeDecision(decision) };
  });

  app.get('/api/policies', async () => ({ policies: store.listPolicies() }));

  app.post('/api/policies', async (request) => {
    const { expectedVersion, ...body } = parse(UpsertPolicyRequest, request.body);
    // Limits are compared as plain numbers against the policy currency, so a
    // limit expressed in another currency (or a negative one) would be silently
    // meaningless. Reject it instead.
    const limits = [
      ['maxTransaction', body.maxTransaction],
      ['dailyLimit', body.dailyLimit],
      ['approvalThreshold', body.approvalThreshold],
    ] as const;
    const issues: Array<{ path: string; message: string }> = [];
    for (const [name, limit] of limits) {
      if (limit.currency !== body.currency) {
        issues.push({ path: `${name}.currency`, message: `Must be ${body.currency}, the policy currency.` });
      }
      if (limit.amount < 0) issues.push({ path: `${name}.amount`, message: 'Must not be negative.' });
    }
    if (body.maxTransaction.amount <= 0) {
      issues.push({ path: 'maxTransaction.amount', message: 'Must be greater than zero.' });
    }
    if (body.dailyLimit.amount < body.maxTransaction.amount) {
      issues.push({ path: 'dailyLimit.amount', message: 'Must be at least the per-transaction limit.' });
    }
    if (issues.length > 0) {
      throw new ApiHttpError(400, 'INVALID_INPUT', 'Request validation failed.', { issues });
    }
    const current = body.id ? store.getPolicy(body.id) : undefined;
    if (body.id && !current) throw errors.notFound(`Policy ${body.id}`);
    if (current && expectedVersion !== undefined && expectedVersion !== current.version) {
      throw errors.conflict(
        'POLICY_VERSION_MISMATCH',
        `Policy ${current.id} is at version ${current.version}, not ${expectedVersion}. Reload it and apply the change again.`,
        { expected: expectedVersion, actual: current.version },
      );
    }

    if (!current) {
      const policy: UserPolicyT = {
        id: newId('policy'),
        name: body.name,
        currency: body.currency,
        maxTransaction: body.maxTransaction,
        dailyLimit: body.dailyLimit,
        approvalThreshold: body.approvalThreshold,
        requireApproval: body.requireApproval,
        blockedCategories: body.blockedCategories,
        allowedCategories: body.allowedCategories,
        blockedMerchants: body.blockedMerchants,
        maxQuoteAgeMinutes: body.maxQuoteAgeMinutes,
        emergencyStop: body.emergencyStop,
        version: 1,
        updatedAt: nowIso(),
      };
      store.savePolicy(policy);
      store.appendEvent({
        correlationId: newId('corr'),
        type: 'policy.updated',
        actor: 'user',
        source: 'policy-engine',
        payload: { policyId: policy.id, version: policy.version },
      });
      return { policy };
    }
    const base = current ?? services.activePolicy();
    const policy = bumpPolicyVersion({ ...base, ...body, id: base.id });
    store.savePolicy(policy);
    store.appendEvent({
      correlationId: newId('corr'),
      type: 'policy.updated',
      actor: 'user',
      source: 'policy-engine',
      payload: {
        policyId: policy.id,
        version: policy.version,
        previousVersion: base.version,
        changes: Object.keys(body),
      },
    });
    return { policy };
  });

  // --------------------------------------------------------------- purchases

  app.post('/api/purchases/prepare', async (request, reply) => {
    const body = parse(PreparePurchaseRequest, request.body);
    const key = idempotencyKey(request);
    if (key) {
      const replay = store.findIdempotent<Record<string, unknown>>(key, prepareScope(body));
      if (replay) {
        reply.header('idempotent-replay', 'true');
        return reply.code(replay.statusCode).send(replay.response);
      }
    }
    // Two requests with the same key that arrive together (a double click)
    // share one execution, so only one plan and one provider order are created.
    const flight = key ? `${key}|${prepareScope(body)}` : undefined;
    let pending = flight ? preparing.get(flight) : undefined;
    if (!pending) {
      pending = preparePurchase(services, body);
      if (flight) {
        const started = pending;
        preparing.set(flight, started);
        void started.catch(() => undefined).finally(() => preparing.delete(flight));
      }
    }
    const result = await pending;
    if (result.blocked) {
      store.savePlan(result.plan);
      throw errors.policyBlocked(
        summarizeDecision(result.plan.policyResult),
        {
          planId: result.plan.id,
          blockingRules: result.plan.policyResult.rules
            .filter((rule) => rule.outcome === 'block')
            .map((rule) => rule.rule),
        },
      );
    }
    const response = {
      plan: result.plan,
      approval: result.approval,
      payment: result.payment,
      approvalUrl: result.approvalUrl,
      blocked: false,
    };
    if (key) store.saveIdempotent(key, prepareScope(body), 200, response);
    return reply.code(200).send(response);
  });

  app.get('/api/purchases/:planId', async (request) => {
    const planId = param(request, 'planId');
    const plan = store.getPlan(planId);
    if (!plan) throw errors.notFound(`Purchase plan ${planId}`);
    return {
      plan,
      approval: store.getApprovalByPlan(planId) ?? null,
      payment: store.getPaymentByPlan(planId) ?? null,
      approvalUrl: null,
      blocked: plan.status === 'policy_blocked',
    };
  });

  app.post('/api/purchases/:planId/approve', async (request) => {
    const planId = param(request, 'planId');
    const body = parse(ApprovePurchaseRequest, request.body);
    const key = idempotencyKey(request);
    if (key) {
      const replay = store.findIdempotent<Record<string, unknown>>(key, `approve:${planId}`);
      if (replay) return { ...replay.response, idempotentReplay: true };
    }
    const { approval, plan } = approvePurchase(services, planId, {
      actor: body.actor,
      planHash: body.planHash,
      ...(body.confirm !== undefined ? { confirm: body.confirm } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    const response = { approval, plan };
    if (key) store.saveIdempotent(key, `approve:${planId}`, 200, response);
    return response;
  });

  app.post('/api/purchases/:planId/capture', async (request) => {
    const planId = param(request, 'planId');
    const body = parse(CapturePurchaseRequest, request.body);
    const key = idempotencyKey(request);
    if (key) {
      const replay = store.findIdempotent<Record<string, unknown>>(key, `capture:${planId}`);
      if (replay) return { ...replay.response, idempotentReplay: true };
    }
    const outcome = await capturePurchase(services, planId, {
      actor: body.actor,
      planHash: body.planHash,
      ...(body.payerId !== undefined ? { payerId: body.payerId } : {}),
    });
    const response = {
      payment: outcome.payment,
      plan: outcome.plan,
      automation: outcome.automation,
    };
    if (key) store.saveIdempotent(key, `capture:${planId}`, 200, response);
    return response;
  });

  app.get('/api/payments/:paymentId', async (request) => {
    const paymentId = param(request, 'paymentId');
    const payment = store.getPayment(paymentId);
    if (!payment) throw errors.notFound(`Payment ${paymentId}`);
    const registry = createToolRegistry(services);
    const ctx = { runId: payment.runId, correlationId: newId('corr') };
    const observed = await callTool(services, registry, 'get_paypal_order', { paypalOrderId: payment.paypalOrderId }, ctx);
    const data = observed.data as Record<string, unknown> | undefined;
    const completed = data?.completed === true;
    const observedAmount = data?.amount as { amount?: number; currency?: string } | null | undefined;
    // Compared in minor units and with the currency: 10 USD is not 10 EUR, and
    // float equality is not a safe way to compare money.
    const amountMatches =
      typeof observedAmount?.amount === 'number' &&
      toMinorUnits(observedAmount.amount) === toMinorUnits(payment.amount.amount) &&
      observedAmount.currency === payment.amount.currency;
    const verified = completed && amountMatches;
    return {
      // A read never downgrades or rewrites the record; it only confirms it.
      payment:
        verified && payment.status === 'captured' && payment.verificationState !== 'verified'
          ? store.savePayment({ ...payment, verificationState: 'verified', updatedAt: nowIso() })
          : payment,
      observed: data ?? {},
      verified,
    };
  });

  // ------------------------------------------------------------- automation

  app.post('/api/automations/test', async (request) => {
    const body = parse(
      z.object({ purchasePlanId: z.string().optional() }).partial(),
      request.body ?? {},
    );
    if (!body.purchasePlanId) {
      const delivery = await services.automation.test();
      return { status: delivery.status, hook: delivery.hook, responseSummary: delivery.responseSummary, durationMs: delivery.durationMs, run: null };
    }
    const plan = store.getPlan(body.purchasePlanId);
    if (!plan) throw errors.notFound(`Purchase plan ${body.purchasePlanId}`);
    const registry = createToolRegistry(services);
    const ctx = { runId: plan.runId, correlationId: plan.correlationId };
    const result = await callTool(
      services,
      registry,
      'trigger_automation',
      { purchasePlanId: plan.id, triggerEventId: newId('evt') },
      ctx,
    );
    const data = result.data as
      | { status?: string; hook?: string; responseSummary?: string; durationMs?: number; automation?: unknown }
      | undefined;
    return {
      status: (data?.status ?? 'failed') as 'sent' | 'failed' | 'unconfigured',
      hook: data?.hook ?? '(not configured)',
      responseSummary: data?.responseSummary ?? result.error ?? 'Delivery failed',
      durationMs: data?.durationMs ?? 0,
      run: data?.automation ?? null,
    };
  });

  // ------------------------------------------------------------------- audit

  app.get('/api/events', async (request) => {
    const query = parse(EventQuery, request.query);
    const result = await services.auditIndex.search({
      ...(query.q ? { q: query.q } : {}),
      ...(query.type?.length ? { types: query.type } : {}),
      ...(query.severity?.length ? { severities: query.severity } : {}),
      ...(query.correlationId ? { correlationId: query.correlationId } : {}),
      ...(query.runId ? { runId: query.runId } : {}),
      ...(query.since ? { since: query.since } : {}),
      ...(query.until ? { until: query.until } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.offset ? { offset: query.offset } : {}),
    });
    const degradation =
      'degradedReason' in result && typeof result.degradedReason === 'string'
        ? result.degradedReason
        : undefined;
    return {
      total: result.total,
      tookMs: result.tookMs,
      engine: result.engine,
      ...(degradation ? { degradedReason: degradation } : {}),
      facets: result.facets,
      events: result.events,
    };
  });

  app.get('/api/events/:eventId', async (request) => {
    const eventId = param(request, 'eventId');
    const event = store.getEvent(eventId);
    if (!event) throw errors.notFound(`Event ${eventId}`);
    return { event };
  });

  // ----------------------------------------------------------------- system

  app.get('/api/health', async (_request, reply) => {
    const providers = await services.providerHealth();
    const databaseOk = store.healthCheck();
    const critical = providers.filter(
      (provider) => provider.provider === 'paypal' && provider.status === 'unavailable',
    );
    const degraded = providers.some((provider) => provider.status === 'degraded');
    const status = !databaseOk ? 'fail' : critical.length > 0 ? 'fail' : degraded ? 'degraded' : 'ok';
    // Platform health checks only look at the status code, so a broken
    // database must not answer 200.
    if (!databaseOk) void reply.code(503);
    return {
      status,
      llm: services.llmConfig?.provider ?? 'deterministic',
      service: 'autopilot-api',
      version: '1.0.0',
      mode: services.gateway.mode,
      uptimeSeconds: Math.round((Date.now() - services.startedAt) / 1000),
      database: { engine: 'sqlite', path: store.path, ok: databaseOk },
      providers,
      checks: {
        policyEngine: true,
        eventLog: databaseOk,
        paymentAdapter: providers.some((provider) => provider.provider === 'paypal'),
      },
      timestamp: nowIso(),
    };
  });

  app.get('/api/openapi.json', async (_request, reply) =>
    reply
      .type('application/json')
      .send(buildOpenApiDocument({ serverUrl: services.env.apiPublicUrl })),
  );

  app.get('/api/automations/history', async () => ({ automations: store.listAutomations(50) }));

  app.post('/api/automations/retry/:planId', async (request) => {
    const planId = param(request, 'planId');
    const plan = store.getPlan(planId);
    if (!plan) throw errors.notFound(`Purchase plan ${planId}`);
    const payment = store.getPaymentByPlan(planId);
    if (payment?.verificationState !== 'verified') {
      throw errors.conflict(
        'AUTOMATION_NOT_ALLOWED',
        'Automations only run for payments that were independently verified.',
        { verificationState: payment?.verificationState ?? 'none' },
      );
    }
    const delivery = await deliverAutomation(services, planId, newId('evt'), plan.correlationId);
    return { status: delivery.status, responseSummary: delivery.responseSummary, eventType: delivery.eventType };
  });
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ApiHttpError(400, 'INVALID_INPUT', 'Request validation failed.', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function param(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw errors.notFound(`Route parameter ${name}`);
  }
  return value;
}

/** An idempotency key only replays the response of the same logical request. */
function prepareScope(body: { runId: string; productId: string; quantity?: number; policyId?: string }): string {
  return `prepare:${body.runId}:${body.productId}:${body.quantity ?? 1}:${body.policyId ?? ''}`;
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof ApiHttpError) {
    void reply
      .code(error.statusCode)
      .send(errorBody({
        code: error.code,
        message: error.message,
        correlationId: error.correlationId ?? correlationIdOf(request),
        ...(error.details ? { details: error.details } : {}),
      }));
    return;
  }
  const zodError = error as { name?: string; issues?: Array<{ path: PropertyKey[]; message: string }> };
  if (zodError?.name === 'ZodError' && Array.isArray(zodError.issues)) {
    void reply.code(400).send(errorBody({
      code: 'INVALID_INPUT',
      message: 'Request validation failed.',
      correlationId: correlationIdOf(request),
      details: {
        issues: zodError.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      },
    }));
    return;
  }
  // Errors raised by Fastify itself (malformed JSON, body too large, wrong
  // content type) are the caller's fault and carry a 4xx status; they must not
  // be reported as an internal error.
  const httpError = error as { statusCode?: unknown; message?: unknown };
  if (typeof httpError?.statusCode === 'number' && httpError.statusCode >= 400 && httpError.statusCode < 500) {
    const code =
      httpError.statusCode === 413
        ? 'PAYLOAD_TOO_LARGE'
        : httpError.statusCode === 415
          ? 'UNSUPPORTED_MEDIA_TYPE'
          : httpError.statusCode === 404
            ? 'NOT_FOUND'
            : 'INVALID_INPUT';
    void reply.code(httpError.statusCode).send(errorBody({
      code,
      message: typeof httpError.message === 'string' && httpError.message ? httpError.message : 'The request could not be processed.',
      correlationId: correlationIdOf(request),
    }));
    return;
  }
  // SECURITY: log the real error server-side but never expose raw error messages
  // to clients — they may contain internal paths, DB schema, or stack traces.
  request.log.error({ err: error }, 'Unhandled error');
  void reply.code(500).send(errorBody({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again or contact support.',
    correlationId: correlationIdOf(request),
  }));
}

function correlationIdOf(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.length >= 8 ? value : 'corr_unspecified_request';
}