import {
  buildIntent,
  parseIntent,
  stageProgress,
  stageLabel,
} from '@autopilot/agent-tools';
import {
  newCorrelationId,
  newId,
  nowIso,
  type CatalogSearchRequestT,
  type EvaluationT,
  type IntentT,
  type ProductT,
  type RunDetailResponseT,
  type RunT,
  type ShortlistT,
} from '@autopilot/schemas';
import { errors } from '../errors.ts';
import type { Services } from './container.ts';
import { callTool, createToolRegistry, evaluateAll } from './tools.ts';

export interface CreatedIntent {
  intent: IntentT;
  correlationId: string;
}

/**
 * Parses a shopper's request. The deterministic parser is always the source of
 * truth for money fields; the LLM may only enrich classification and soft
 * preferences, and any fallback is recorded in the audit trail.
 */
export async function createIntent(
  services: Services,
  input: { text: string; currency?: string; requireApproval?: boolean },
): Promise<CreatedIntent> {
  const started = Date.now();
  const policy = services.activePolicy();
  const result = await parseIntent(input.text, {
    config: services.llmConfig,
    defaultCurrency: (input.currency as IntentT['constraints']['currency']) ?? services.env.defaultCurrency,
    ...(input.requireApproval !== undefined ? { requireApprovalOverride: input.requireApproval } : {}),
  });

  const intent = buildIntent({
    parsed: result.parsed,
    rawText: input.text,
    engine: {
      name: result.usedLlm ? 'llm-assisted' : 'deterministic',
      ...(result.usedLlm && result.model ? { model: result.model, provider: services.llmConfig?.provider ?? 'llm' } : {}),
      usedLlm: result.usedLlm,
      latencyMs: Date.now() - started,
    },
    ...(input.requireApproval !== undefined ? { requireApprovalOverride: input.requireApproval } : {}),
    approvalThreshold: policy.approvalThreshold.amount,
  });

  // Policy may force approval even when the shopper did not ask for it.
  if (policy.requireApproval) intent.approvalRequired = true;
  if (result.fallbackReason) {
    intent.notes.push(`LLM enrichment unavailable: ${result.fallbackReason}`);
  }
  intent.notes.push(`Money rules will be checked against ${policy.name} v${policy.version}.`);

  services.store.saveIntent(intent);
  const correlationId = newCorrelationId();
  services.store.appendEvent({
    correlationId,
    type: 'intent.created',
    actor: 'user',
    source: intent.engine.name,
    payload: {
      intentId: intent.id,
      category: intent.category,
      confidence: intent.confidence,
      budget: intent.budget ?? null,
      requireApproval: intent.approvalRequired,
      usedLlm: intent.engine.usedLlm,
      ...(result.fallbackReason ? { llmFallback: result.fallbackReason } : {}),
      openQuestions: intent.openQuestions,
    },
  });
  return { intent, correlationId };
}

export function updateIntent(
  services: Services,
  intentId: string,
  patch: {
    numeric?: IntentT['constraints']['numeric'];
    keywords?: string[];
    preferences?: string[];
    budgetMax?: { amount: number; currency: IntentT['constraints']['currency'] };
    budgetMin?: { amount: number; currency: IntentT['constraints']['currency'] };
    requireApproval?: boolean;
  },
): IntentT {
  const intent = services.store.getIntent(intentId);
  if (!intent) throw errors.notFound(`Intent ${intentId}`);
  const updated: IntentT = {
    ...intent,
    status: 'interpreted',
    constraints: {
      ...intent.constraints,
      ...(patch.numeric ? { numeric: patch.numeric } : {}),
      ...(patch.keywords ? { keywords: patch.keywords } : {}),
      ...(patch.preferences ? { preferences: patch.preferences } : {}),
      ...(patch.budgetMax ? { budgetMax: patch.budgetMax } : {}),
      ...(patch.budgetMin ? { budgetMin: patch.budgetMin } : {}),
      ...(patch.requireApproval !== undefined ? { requireApproval: patch.requireApproval } : {}),
    },
    ...(patch.requireApproval !== undefined ? { approvalRequired: patch.requireApproval } : {}),
    ...(patch.budgetMax ? { budget: patch.budgetMax } : {}),
  };
  services.store.saveIntent(updated);
  services.store.appendEvent({
    correlationId: newCorrelationId(),
    type: 'intent.updated',
    actor: 'user',
    source: 'api',
    payload: { intentId: updated.id, changes: Object.keys(patch) },
  });
  return updated;
}

export function buildSearchRequest(intent: IntentT): CatalogSearchRequestT {
  const keywords = [...intent.constraints.keywords, ...intent.constraints.preferences];
  const query = keywords.length > 0 ? keywords.join(' ') : intent.rawText.slice(0, 120);
  return {
    query,
    category: intent.category,
    currency: intent.constraints.currency,
    ...(intent.constraints.budgetMax ? { maxPrice: intent.constraints.budgetMax.amount } : {}),
    ...(intent.constraints.budgetMin ? { minPrice: intent.constraints.budgetMin.amount } : {}),
    limit: 20,
  };
}

export interface StartRunOptions {
  intentId: string;
  productIds?: string[];
  actor?: string;
}

/**
 * Executes the non-money stages of a run: discovery, evaluation, decision and
 * the policy pre-check. Nothing money-affecting happens here — the purchase
 * plan, approval gate and payment execution are separate, explicit endpoints.
 */
export async function startRun(services: Services, options: StartRunOptions): Promise<RunT> {
  const intent = services.store.getIntent(options.intentId);
  if (!intent) throw errors.notFound(`Intent ${options.intentId}`);
  const policy = services.activePolicy();
  const registry = createToolRegistry(services);
  const correlationId = newCorrelationId();

  let run: RunT = {
    id: newId('run'),
    intentId: intent.id,
    correlationId,
    stage: 'intent',
    status: 'running',
    engine: intent.engine,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    progress: stageProgress('intent'),
    progressLabel: 'Starting run',
    candidateCount: 0,
    shortlistedProductIds: [],
    planId: null,
    policyId: policy.id,
    blockedReason: null,
    summary: null,
  };
  run = services.store.saveRun(run);
  services.store.appendEvent({
    correlationId,
    runId: run.id,
    type: 'run.created',
    actor: options.actor ?? 'user',
    source: 'api',
    payload: { intentId: intent.id, engine: intent.engine, policyId: policy.id },
  });

  const ctx = { runId: run.id, correlationId };

  // ------------------------------------------------------------- discovery
  run = advance(services, run, 'discover', 'Discovering candidates');
  services.store.appendEvent({
    correlationId,
    runId: run.id,
    type: 'catalog.search.started',
    actor: 'agent',
    source: services.catalog.description,
    payload: buildSearchRequest(intent),
  });

  const candidates = options.productIds?.length
    ? options.productIds
        .map((id) => services.store.getProduct(id))
        .filter((product): product is ProductT => Boolean(product))
    : [];

  if (candidates.length === 0) {
    const search = await callTool(services, registry, 'catalog_search', buildSearchRequest(intent), ctx);
    if (!search.ok) {
      return failRun(services, run, 'Discovery failed: the catalog provider did not return usable data.', search.error ?? 'unknown error');
    }
  }
  const products = services.store.listProductsByRun(run.id);
  services.store.appendEvent({
    correlationId,
    runId: run.id,
    type: 'catalog.search.completed',
    actor: 'agent',
    source: products[0]?.provider ?? 'catalog',
    payload: { count: products.length, productIds: products.map((product) => product.id) },
  });
  run = services.store.saveRun({ ...run, candidateCount: products.length });

  if (products.length === 0) {
    return failRun(
      services,
      run,
      'No candidates matched this request. Broaden the budget or relax a hard constraint and try again.',
      'NO_CANDIDATES',
    );
  }

  // ------------------------------------------------------------ evaluation
  run = advance(services, run, 'evaluate', 'Evaluating evidence');
  const compared = await callTool(
    services,
    registry,
    'compare_products',
    { intentId: intent.id, productIds: products.map((product) => product.id) },
    ctx,
  );
  if (!compared.ok) {
    return failRun(services, run, 'Evaluation failed.', compared.error ?? 'unknown error');
  }
  const evaluations = services.store.listEvaluationsByRun(run.id);
  for (const evaluation of evaluations) {
    services.store.appendEvent({
      correlationId,
      runId: run.id,
      type: 'product.evaluated',
      actor: 'agent',
      source: 'scoring',
      payload: {
        productId: evaluation.productId,
        score: evaluation.score,
        disqualified: evaluation.disqualified,
        unverifiedFields: evaluation.evidenceQuality.unverifiedFields,
      },
    });
    if (evaluation.evidenceQuality.unverifiedFields.length > 0) {
      services.store.appendEvent({
        correlationId,
        runId: run.id,
        type: 'evidence.gap.detected',
        actor: 'agent',
        source: 'evidence',
        severity: 'warn',
        payload: {
          productId: evaluation.productId,
          fields: evaluation.evidenceQuality.unverifiedFields,
          note: 'These values are shown to the buyer as unverified and never as fact.',
        },
      });
    }
  }

  // --------------------------------------------------------------- decision
  run = advance(services, run, 'decide', 'Building shortlist');
  const shortlist = services.store.getShortlistByRun(run.id);
  if (!shortlist) {
    return failRun(services, run, 'The agent could not build a shortlist from the evaluated candidates.');
  }
  services.store.appendEvent({
    correlationId,
    runId: run.id,
    type: 'shortlist.created',
    actor: 'agent',
    source: 'decision',
    payload: {
      shortlistId: shortlist.id,
      entries: shortlist.entries.map((entry) => ({
        rank: entry.rank,
        productId: entry.productId,
        score: entry.score,
        rationale: entry.rationale,
      })),
      rejected: shortlist.rejected,
    },
  });
  run = services.store.saveRun({ ...run, shortlistedProductIds: shortlist.entries.map((entry) => entry.productId) });

  // ---------------------------------------------------------------- policy
  run = advance(services, run, 'policy', 'Checking money policy');
  const topProduct = products.find((product) => product.id === shortlist.entries[0]?.productId) ?? products[0]!;
  const checked = await callTool(
    services,
    registry,
    'policy_check',
    {
      amount: topProduct.price,
      category: topProduct.category,
      currency: topProduct.currency,
      merchant: topProduct.provider,
      productId: topProduct.id,
      quotedAt: nowIso(),
      availability: topProduct.availability.status,
      correlationId,
    },
    ctx,
  );
  if (!checked.ok) {
    return failRun(services, run, 'Policy check failed.', checked.error ?? 'unknown error');
  }
  const decision = checked.data as { outcome: string } | undefined;

  run = advance(services, run, 'prepare', 'Ready for purchase preparation');
  const blockedByPolicy = decision?.outcome === 'deny';
  run = services.store.saveRun({
    ...run,
    status: blockedByPolicy ? 'blocked' : 'completed',
    progress: stageProgress(blockedByPolicy ? 'done' : 'prepare'),
    progressLabel: blockedByPolicy ? 'Blocked by policy' : 'Shortlist ready',
    blockedReason: blockedByPolicy ? 'policy_denied' : null,
    summary: blockedByPolicy
      ? 'Policy denies the leading candidate, so no purchase can be prepared for it.'
      : `Ranked ${shortlist.entries.length} candidate(s). Leading option: ${shortlist.entries[0]?.rationale ?? 'n/a'}`,
  });
  if (blockedByPolicy) {
    services.store.appendEvent({
      correlationId,
      runId: run.id,
      type: 'action.failed',
      actor: 'system',
      source: 'policy-engine',
      severity: 'warn',
      payload: { reason: 'policy_denied', productId: topProduct.id },
    });
  }
  return services.store.getRun(run.id) ?? run;
}

export function evaluateIntent(
  services: Services,
  input: { intentId: string; productIds?: string[]; runId?: string },
): { evaluations: EvaluationT[]; shortlist: ShortlistT; products: ProductT[] } {
  const intent = services.store.getIntent(input.intentId);
  if (!intent) throw errors.notFound(`Intent ${input.intentId}`);
  const products = input.productIds?.length
    ? input.productIds
        .map((id) => services.store.getProduct(id))
        .filter((product): product is ProductT => Boolean(product))
    : input.runId
      ? services.store.listProductsByRun(input.runId)
      : [];
  if (products.length === 0) {
    throw errors.notFound('Products for this evaluation');
  }
  const { evaluations, shortlist } = evaluateAll(services, intent, products, input.runId);
  if (input.runId) services.store.saveShortlist(shortlist);
  return { evaluations, shortlist, products };
}

export function runDetail(services: Services, runId: string): RunDetailResponseT {
  const run = services.store.getRun(runId);
  if (!run) throw errors.notFound(`Run ${runId}`);
  const intent = services.store.getIntent(run.intentId);
  if (!intent) throw errors.notFound(`Intent ${run.intentId}`);
  const plans = services.store.listPlansByRun(runId);
  const plan = plans[0] ?? null;
  const payments = services.store.listPaymentsByRun(runId);
  const events = services.store.queryEvents({ correlationId: run.correlationId, limit: 200 }).events;
  return {
    run,
    intent,
    products: services.store.listProductsByRun(runId),
    evaluations: services.store.listEvaluationsByRun(runId),
    shortlist: services.store.getShortlistByRun(runId) ?? null,
    plan,
    approval: plan ? services.store.getApprovalByPlan(plan.id) ?? null : null,
    payment: payments[0] ?? null,
    automations: services.store.listAutomationsByRun(runId),
    events: events.sort((a, b) => a.sequence - b.sequence),
    toolCalls: services.store.listToolCalls(runId),
  };
}

function advance(services: Services, run: RunT, stage: RunT['stage'], label: string): RunT {
  const updated = services.store.saveRun({
    ...run,
    stage,
    progress: stageProgress(stage),
    progressLabel: label,
    updatedAt: nowIso(),
  });
  services.store.appendEvent({
    correlationId: run.correlationId,
    runId: run.id,
    type: 'run.stage.changed',
    actor: 'agent',
    source: 'orchestrator',
    payload: { stage, label: stageLabel(stage), progress: updated.progress },
  });
  return updated;
}

function failRun(services: Services, run: RunT, reason: string, code = 'RUN_FAILED'): RunT {
  const updated = services.store.saveRun({
    ...run,
    status: code === 'NO_CANDIDATES' ? 'blocked' : 'failed',
    stage: 'done',
    progress: 1,
    progressLabel: code === 'NO_CANDIDATES' ? 'No candidates' : 'Failed',
    blockedReason: reason,
    summary: reason,
  });
  services.store.appendEvent({
    correlationId: run.correlationId,
    runId: run.id,
    type: code === 'NO_CANDIDATES' ? 'action.failed' : 'run.failed',
    actor: 'system',
    source: 'orchestrator',
    severity: 'warn',
    payload: { code, reason },
  });
  return updated;
}