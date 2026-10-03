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
    const intent = updateIntent(services, intentId, {
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
    if (run.status === 'blocked' && run.blockedReason) {
      // The run is persisted and fully auditable even when it cannot proceed.
      throw errors.conflict('NO_CANDIDATES', run.blockedReason, { runId: run.id, runStatus: run.status });
    }
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

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
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

    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      store.bus.off('event', onEvent);
      store.bus.off('run', onRun);
    });
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
    const body = parse(UpsertPolicyRequest, request.body);
    const current = body.id ? store.getPolicy(body.id) : undefined;
    if (body.id && !current) throw errors.notFound(`Policy ${body.id}`);

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
      const replay = store.findIdempotent<Record<string, unknown>>(key, 'prepare');
      if (replay) {
        reply.header('idempotent-replay', 'true');
        return reply.code(replay.statusCode).send(replay.response);
      }
    }
    const result = await preparePurchase(services, body);
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
    if (key) store.saveIdempotent(key, 'prepare', 200, response);
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
      const replay = store.findIdempotent<Record<string, unknown>>(key, 'approve');
      if (replay) return { ...replay.response, idempotentReplay: true };
    }
    const { approval, plan } = approvePurchase(services, planId, {
      actor: body.actor,
      planHash: body.planHash,
      ...(body.confirm !== undefined ? { confirm: body.confirm } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    const response = { approval, plan };
    if (key) store.saveIdempotent(key, 'approve', 200, response);
    return response;
  });

  app.post('/api/purchases/:planId/capture', async (request) => {
    const planId = param(request, 'planId');
    const body = parse(CapturePurchaseRequest, request.body);
    const key = idempotencyKey(request);
    if (key) {
      const replay = store.findIdempotent<Record<string, unknown>>(key, 'capture');
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
    if (key) store.saveIdempotent(key, 'capture', 200, response);
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
    const amountMatches =
      (data?.amount as { amount?: number } | undefined)?.amount === payment.amount.amount;
    return {
      payment: store.savePayment({
        ...payment,
        verificationState: completed && amountMatches ? 'verified' : payment.verificationState,
        updatedAt: nowIso(),
      }),
      observed: data ?? {},
      verified: completed && amountMatches,
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
    const payment = store.getPaymentByPlan(plan.id);
    const registry = createToolRegistry(services);
    const ctx = { runId: plan.runId, correlationId: plan.correlationId };
    const result = await callTool(
      services,
      registry,
      'trigger_automation',
      { purchasePlanId: plan.id, triggerEventId: newId('evt') },
      ctx,
    );
    const data = result.data as { status?: string; hook?: string; responseSummary?: string; durationMs?: number } | undefined;
    return {
      status: (data?.status ?? 'failed') as 'sent' | 'failed' | 'unconfigured',
      hook: data?.hook ?? '(not configured)',
      responseSummary: data?.responseSummary ?? result.error ?? 'Delivery failed',
      durationMs: data?.durationMs ?? 0,
      run: null,
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

  app.get('/api/health', async () => {
    const providers = await services.providerHealth();
    const databaseOk = store.healthCheck();
    const critical = providers.filter(
      (provider) => provider.provider === 'paypal' && provider.status === 'unavailable',
    );
    const degraded = providers.some((provider) => provider.status === 'degraded');
    return {
      status: !databaseOk ? 'fail' : critical.length === 0 && degraded ? 'ok' : degraded ? 'degraded' : 'ok',
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
  const message = error instanceof Error ? error.message : String(error);
  request.log.error({ err: error }, 'Unhandled error');
  void reply.code(500).send(errorBody({
    code: 'INTERNAL_ERROR',
    message,
    correlationId: correlationIdOf(request),
  }));
}

function correlationIdOf(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.length >= 8 ? value : 'corr_unspecified_request';
}