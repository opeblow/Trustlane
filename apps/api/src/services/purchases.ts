import { evaluatePolicy } from '@autopilot/policy-engine';
import {
  isoPlusDays,
  isoPlusMinutes,
  money,
  newId,
  nowIso,
  type MoneyT,
  sha256,
  toMinorUnits,
  type ApprovalT,
  type PaymentT,
  type PreparePurchaseRequestT,
  type ProductT,
  type PurchasePlanT,
  type RiskFlagT,
  type RunT,
} from '@autopilot/schemas';
import { ApiHttpError, errors } from '../errors.ts';
import type { Services } from './container.ts';
import { authoriseSentence, callTool, createToolRegistry, deliverAutomation } from './tools.ts';

export interface PrepareResult {
  plan: PurchasePlanT;
  approval: ApprovalT | null;
  payment: PaymentT | null;
  approvalUrl: string | null;
  blocked: boolean;
}

/**
 * Prepares a purchase plan.
 *
 * Order of operations matters and is deliberate:
 *  1. re-read the live price from the catalog (never trust the run snapshot),
 *  2. re-run the money policy on that price,
 *  3. create the PayPal order only when policy allows it,
 *  4. request explicit human approval whenever policy requires it.
 *
 * A policy denial never creates a provider order.
 */
export async function preparePurchase(
  services: Services,
  input: PreparePurchaseRequestT,
): Promise<PrepareResult> {
  const store = services.store;
  const run = store.getRun(input.runId);
  if (!run) throw errors.notFound(`Run ${input.runId}`);
  const intent = store.getIntent(run.intentId);
  if (!intent) throw errors.notFound(`Intent ${run.intentId}`);

  const stored = store.getProduct(input.productId);
  if (!stored) throw errors.notFound(`Product ${input.productId}`);

  // 1. Fresh price from the provider.
  const live = await services.catalog.primary.details(input.productId);
  const product: ProductT = live ?? stored;
  store.saveProduct(product, { runId: run.id, intentId: intent.id });

  const evaluation = store.listEvaluationsByRun(run.id).find((item) => item.productId === product.id);
  void evaluation;
  if (stored.price.amount !== product.price.amount && stored.currency === product.currency) {
    // Price drift is surfaced as a policy warning, never silently accepted.
    services.store.appendEvent({
      correlationId: run.correlationId,
      runId: run.id,
      type: 'plan.invalidated',
      actor: 'system',
      source: 'catalog',
      severity: 'warn',
      payload: {
        reason: 'price_changed',
        evaluatedAmount: stored.price.amount,
        liveAmount: product.price.amount,
      },
    });
  }

  // 2. Policy on the live amount.
  const policy = input.policyId ? store.getPolicy(input.policyId) ?? services.activePolicy() : services.activePolicy();
  const quantity = input.quantity ?? 1;
  const total = money(product.price.amount * quantity, product.price.currency);
  const spent = store.spentSince(isoPlusDays(-1), policy.currency);
  const decision = evaluatePolicy(
    {
      amount: total,
      category: product.category,
      currency: product.price.currency,
      merchant: product.provider,
      productId: product.id,
      quotedAt: nowIso(),
      availability: product.availability.status,
      correlationId: run.correlationId,
    },
    policy,
    { spentInWindow: money(spent, policy.currency) },
  );
  store.appendEvent({
    correlationId: run.correlationId,
    runId: run.id,
    type: 'policy.checked',
    actor: 'system',
    source: 'policy-engine',
    payload: {
      amount: total,
      outcome: decision.outcome,
      approvalRequired: decision.approvalRequired,
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
      rules: decision.rules,
      inputHash: decision.inputHash,
    },
  });

  const quotedAt = nowIso();
  const planHash = planHashFor({
    productId: product.id,
    amount: total,
    currency: total.currency,
    quantity,
    policyId: policy.id,
    policyVersion: policy.version,
    policyInputHash: decision.inputHash,
  });

  const riskFlags: RiskFlagT[] = decision.rules
    .filter((rule) => rule.outcome !== 'pass')
    .map((rule) => ({
      code: rule.rule,
      severity: rule.outcome === 'block' ? 'block' : 'warn',
      message: rule.message,
    }));
  if (services.gateway.mode === 'simulated') {
    riskFlags.push({
      code: 'simulated_payment_provider',
      severity: 'warn',
      message:
        'No PayPal credentials are configured, so this execution runs against Autopilot’s offline simulated gateway. No money moves.',
    });
  }

  const plan: PurchasePlanT = {
    id: newId('plan'),
    runId: run.id,
    intentId: intent.id,
    product,
    lineItems: [
      {
        productId: product.id,
        title: product.title,
        quantity,
        unitPrice: product.price,
        total,
        category: product.category,
        merchant: product.provider,
      },
    ],
    subtotal: total,
    shipping: money(0, total.currency),
    tax: money(0, total.currency),
    total,
    currency: total.currency,
    policyResult: decision,
    paypalOrderId: null,
    approvalId: null,
    status: decision.outcome === 'deny' ? 'policy_blocked' : 'draft',
    riskFlags,
    planHash,
    quotedAt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: isoPlusMinutes(Math.max(5, policy.maxQuoteAgeMinutes)),
    correlationId: run.correlationId,
  };

  if (input.expectedPlanHash && input.expectedPlanHash !== planHash) {
    throw errors.conflict(
      'PLAN_HASH_MISMATCH',
      'The plan changed after you reviewed it. Review the updated terms before approving.',
      { expected: input.expectedPlanHash, actual: planHash },
    );
  }

  store.savePlan(plan);
  store.appendEvent({
    correlationId: run.correlationId,
    runId: run.id,
    type: decision.outcome === 'deny' ? 'action.failed' : 'plan.created',
    actor: 'system',
    source: 'policy-engine',
    ...(decision.outcome === 'deny' ? { severity: 'warn' as const } : {}),
    payload: {
      planId: plan.id,
      total,
      planHash,
      outcome: decision.outcome,
      blockingRules: decision.rules.filter((rule) => rule.outcome === 'block').map((rule) => rule.rule),
    },
  });

  updateRunForPurchase(services, run, plan);

  if (decision.outcome === 'deny') {
    return { plan, approval: null, payment: null, approvalUrl: null, blocked: true };
  }

  // 3. Create the provider order.
  const registry = createToolRegistry(services);
  const ctx = { runId: run.id, correlationId: run.correlationId };
  const created = await callTool(
    services,
    registry,
    'create_paypal_order',
    { purchasePlanId: plan.id, correlationId: run.correlationId, description: `Autopilot: ${product.title}` },
    ctx,
  );
  if (!created.ok) {
    const failed = store.savePlan({ ...plan, status: 'failed', updatedAt: nowIso() });
    store.appendEvent({
      correlationId: run.correlationId,
      runId: run.id,
      type: 'action.failed',
      actor: 'agent',
      source: services.gateway.provider,
      severity: 'error',
      payload: { planId: plan.id, stage: 'create_order', error: created.error ?? 'unknown error' },
    });
    throw errors.providerUnavailable(
      `The payment provider refused to create the order: ${created.error ?? 'unknown error'}`,
      { planId: failed.id },
    );
  }
  const paypalOrderId = String((created.data as { paypalOrderId?: string } | undefined)?.paypalOrderId ?? '');
  const approvalUrl = (created.data as { approvalUrl?: string | null } | undefined)?.approvalUrl ?? null;

  let withOrder: PurchasePlanT = { ...plan, paypalOrderId, status: 'paypal_order_created', updatedAt: nowIso() };
  store.savePlan(withOrder);

  // 4. Human gate.
  let approval: ApprovalT | null = null;
  if (decision.approvalRequired || policy.requireApproval || intent.approvalRequired) {
    const requested = await callTool(
      services,
      registry,
      'request_approval',
      { purchasePlanId: plan.id, planHash, correlationId: run.correlationId },
      ctx,
    );
    const approvalId = String((requested.data as { approvalId?: string } | undefined)?.approvalId ?? '');
    approval = store.getApproval(approvalId) ?? null;
    if (approval) {
      withOrder = store.savePlan({ ...withOrder, approvalId: approval.id, status: 'awaiting_approval' });
    }
  } else {
    approval = grantApproval(services, withOrder, { actor: 'policy:auto-approve', planHash, note: 'Policy allowed automatic approval for this amount.' });
    withOrder = store.savePlan({ ...withOrder, approvalId: approval.id, status: 'approved' });
  }

  const payment = store.getPaymentByPlan(withOrder.id) ?? null;
  const finalPlan = store.getPlan(withOrder.id) ?? withOrder;
  return { plan: finalPlan, approval, payment, approvalUrl, blocked: false };
}

/**
 * Records explicit human approval. The supplied plan hash must match the live
 * plan, which is what prevents a stale screen from authorising changed terms.
 */
export function approvePurchase(
  services: Services,
  planId: string,
  input: { actor: string; planHash: string; confirm?: boolean; note?: string },
): { approval: ApprovalT; plan: PurchasePlanT } {
  const store = services.store;
  const plan = store.getPlan(planId);
  if (!plan) throw errors.notFound(`Purchase plan ${planId}`);
  if (plan.planHash !== input.planHash) {
    throw errors.conflict(
      'PLAN_HASH_MISMATCH',
      'This plan no longer matches what you reviewed. Re-open the plan and approve the current terms.',
      { expected: input.planHash, actual: plan.planHash },
    );
  }
  if (plan.status === 'policy_blocked') {
    throw errors.policyBlocked('Policy blocks this purchase, so it cannot be approved.', {
      blockingRules: plan.policyResult.rules.filter((rule) => rule.outcome === 'block').map((rule) => rule.rule),
    });
  }
  const existing = store.getApprovalByPlan(plan.id);
  if (existing?.status === 'approved') {
    return { approval: existing, plan };
  }
  if (existing && new Date(existing.expiresAt).getTime() < Date.now()) {
    store.saveApproval({ ...existing, status: 'expired' });
    store.appendEvent({
      correlationId: plan.correlationId,
      runId: plan.runId,
      type: 'approval.expired',
      actor: 'system',
      source: 'policy-engine',
      payload: { approvalId: existing.id, planId: plan.id },
    });
    throw errors.conflict('APPROVAL_EXPIRED', 'This approval request expired. Re-open the purchase to request a fresh one.', {
      planId: plan.id,
    });
  }
  if (!existing) {
    const created = grantApproval(
      services,
      plan,
      { actor: input.actor, planHash: input.planHash, note: input.note ?? 'Approval recorded by the API.' },
      'pending',
    );
    return { approval: store.getApproval(created.id) ?? created, plan };
  }
  const approval = store.saveApproval({
    ...existing,
    status: 'approved',
    actor: input.actor,
    approvedAt: nowIso(),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  store.savePlan({ ...plan, approvalId: approval.id, status: 'approved', updatedAt: nowIso() });
  store.appendEvent({
    correlationId: plan.correlationId,
    runId: plan.runId,
    type: 'approval.granted',
    actor: input.actor,
    source: 'user',
    payload: {
      approvalId: approval.id,
      planId: plan.id,
      planHash: approval.authorizationScope.planHash,
      amount: approval.authorizationScope.amount,
      attestation: approval.authorizationScope.description,
    },
  });
  const run = store.getRun(plan.runId);
  if (run) {
    store.saveRun({ ...run, stage: 'pay', status: 'running', progressLabel: 'Approved — ready to execute', updatedAt: nowIso() });
  }
  return { approval, plan: store.getPlan(plan.id) ?? plan };
}

export interface CaptureOutcome {
  payment: PaymentT;
  plan: PurchasePlanT;
  automation: ReturnType<typeof toAutomationRun> | null;
}

/**
 * Executes the payment and then verifies it independently.
 *
 * Capture is guarded by an approval bound to the current plan hash, is
 * idempotent, and never reports success from the capture call alone — the order
 * is re-read from the provider before any automation may fire.
 */
export async function capturePurchase(
  services: Services,
  planId: string,
  input: { actor: string; planHash: string; payerId?: string },
): Promise<CaptureOutcome> {
  const store = services.store;
  const plan = store.getPlan(planId);
  if (!plan) throw errors.notFound(`Purchase plan ${planId}`);
  if (plan.planHash !== input.planHash) {
    throw errors.conflict(
      'PLAN_HASH_MISMATCH',
      'The plan changed after approval, so the payment was not executed.',
      { expected: input.planHash, actual: plan.planHash },
    );
  }
  const approval = store.getApprovalByPlan(plan.id);
  if (!approval || (approval.status !== 'approved' && approval.status !== 'consumed')) {
    throw errors.conflict(
      'APPROVAL_REQUIRED',
      'A valid human approval bound to this plan is required before money moves.',
      { planId: plan.id, approvalStatus: approval?.status ?? 'none' },
    );
  }
  if (approval.authorizationScope.planHash !== plan.planHash) {
    throw errors.conflict('PLAN_HASH_MISMATCH', 'The approval does not match the current plan hash.', {
      planId: plan.id,
    });
  }
  if (!plan.paypalOrderId) {
    throw errors.conflict('ORDER_NOT_FOUND', 'This plan has no payment order yet. Prepare the purchase again.');
  }

  const existingPayment = store.getPaymentByPlan(plan.id);
  if (existingPayment && existingPayment.status === 'captured') {
    const verified = await verifyPlan(services, plan.id);
    return {
      payment: store.getPayment(verified.payment.id) ?? existingPayment,
      plan: verified.plan,
      automation: verified.automation,
    };
  }

  // The simulated gateway stands in for the payer approving inside PayPal's UI.
  if (services.gateway.mode === 'simulated' && services.gateway.approveOrder) {
    await services.gateway.approveOrder(plan.paypalOrderId).catch(() => undefined);
  }

  const payment: PaymentT = {
    id: existingPayment?.id ?? newId('pay'),
    purchasePlanId: plan.id,
    runId: plan.runId,
    paypalOrderId: plan.paypalOrderId,
    transactionId: null,
    status: 'created',
    amount: plan.total,
    currency: plan.currency,
    capturedAt: null,
    verificationState: 'unverified',
    provider: services.gateway.provider,
    mode: services.gateway.mode,
    attempts: (existingPayment?.attempts ?? 0) + 1,
    lastError: null,
    createdAt: existingPayment?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  store.savePayment(payment);
  store.savePlan({ ...plan, status: 'payment_pending', updatedAt: nowIso() });

  const registry = createToolRegistry(services);
  const ctx = { runId: plan.runId, correlationId: plan.correlationId };
  const captured = await callTool(
    services,
    registry,
    'capture_payment',
    { purchasePlanId: plan.id, approvalId: approval.id, planHash: plan.planHash, correlationId: plan.correlationId },
    ctx,
  );

  const capturedResult = captured.data as { transactionId?: string | null; status?: string; amount?: MoneyT } | undefined;
  if (!captured.ok) {
    const failed = store.savePayment({
      ...payment,
      status: 'failed',
      lastError: captured.error ?? 'capture failed',
      updatedAt: nowIso(),
    });
    store.savePlan({ ...plan, status: 'failed', updatedAt: nowIso() });
    const run = store.getRun(plan.runId);
    if (run) store.saveRun({ ...run, status: 'failed', stage: 'done', blockedReason: captured.error ?? 'capture failed', updatedAt: nowIso() });
    throw new ApiHttpError(402, 'PAYMENT_FAILED', `Payment was not captured: ${captured.error ?? 'unknown error'}`, {
      paymentId: failed.id,
    });
  }

  const capturedPayment = store.savePayment({
    ...payment,
    status: 'captured',
    transactionId: capturedResult?.transactionId ?? null,
    capturedAt: nowIso(),
    amount: capturedResult?.amount ?? payment.amount,
    updatedAt: nowIso(),
  });
  store.saveApproval({ ...approval, status: 'consumed' });
  store.savePlan({ ...plan, status: 'paid', updatedAt: nowIso() });

  const run = store.getRun(plan.runId);
  if (run) {
    store.saveRun({ ...run, stage: 'verify', status: 'running', progressLabel: 'Verifying payment', updatedAt: nowIso() });
  }

  return verifyPlan(services, plan.id, capturedPayment);
}

/** Re-reads the order from the provider and only then permits automation. */
export async function verifyPlan(
  services: Services,
  planId: string,
  paymentHint?: PaymentT,
): Promise<CaptureOutcome> {
  const store = services.store;
  const plan = store.getPlan(planId);
  if (!plan) throw errors.notFound(`Purchase plan ${planId}`);
  const payment = paymentHint ?? store.getPaymentByPlan(planId) ?? null;
  if (!payment) throw errors.notFound(`Payment for plan ${planId}`);

  const registry = createToolRegistry(services);
  const ctx = { runId: plan.runId, correlationId: plan.correlationId };
  const verification = await callTool(
    services,
    registry,
    'verify_order',
    { purchasePlanId: plan.id, correlationId: plan.correlationId },
    ctx,
  );
  const observed = (verification.data as { observed?: Record<string, unknown> } | undefined)?.observed ?? {};
  const verified = verification.ok === true;
  const verifiedPayment = store.savePayment({
    ...payment,
    verificationState: verified ? 'verified' : 'failed',
    transactionId: (observed.transactionId as string | undefined) ?? payment.transactionId,
    raw: observed,
    updatedAt: nowIso(),
  });
  const verifiedPlan = store.savePlan({
    ...plan,
    status: verified ? 'verified' : 'failed',
    updatedAt: nowIso(),
  });

  const run = store.getRun(plan.runId);
  if (run && !verified) {
    store.saveRun({
      ...run,
      status: 'failed',
      stage: 'done',
      progress: 1,
      progressLabel: 'Verification failed',
      blockedReason: 'The provider state did not match the approved plan.',
      updatedAt: nowIso(),
    });
    return { payment: verifiedPayment, plan: verifiedPlan, automation: null };
  }

  if (!verified) {
    return { payment: verifiedPayment, plan: verifiedPlan, automation: null };
  }

  // Automation may only fire on verified payment state.
  const triggerEventId = newId('evt');
  const delivery = await deliverAutomation(services, plan.id, triggerEventId, plan.correlationId);
  const automation = toAutomationRun({
    id: delivery.id,
    triggerEventId,
    runId: plan.runId,
    purchasePlanId: plan.id,
    hook: services.env.zapier.hookUrl ?? '(not configured)',
    status: delivery.status === 'sent' ? 'sent' : delivery.status === 'failed' ? 'failed' : 'unconfigured',
    responseSummary: delivery.responseSummary,
  });
  store.saveAutomation(automation);

  const finalRun = run
    ? store.saveRun({
        ...run,
        stage: 'done',
        status: 'completed',
        progress: 1,
        progressLabel: 'Completed',
        planId: plan.id,
        summary: `Purchased ${plan.product.title} for ${plan.total.amount} ${plan.total.currency} (${services.gateway.mode}).`,
        blockedReason: null,
        updatedAt: nowIso(),
      })
    : null;
  void finalRun;

  return { payment: verifiedPayment, plan: verifiedPlan, automation };
}

export function grantApproval(
  services: Services,
  plan: PurchasePlanT,
  input: { actor: string; planHash: string; note?: string },
  initialStatus: 'pending' | 'approved' = 'approved',
): ApprovalT {
  const approvedAt = initialStatus === 'approved' ? nowIso() : null;
  const approval: ApprovalT = {
    id: newId('apr'),
    purchasePlanId: plan.id,
    runId: plan.runId,
    authorizationScope: {
      planId: plan.id,
      planHash: plan.planHash,
      amount: plan.total,
      currency: plan.currency,
      policyId: plan.policyResult.policyId,
      policyVersion: plan.policyResult.policyVersion,
      description: authoriseSentence(plan),
      correlationId: plan.correlationId,
    },
    status: initialStatus,
    actor: input.actor,
    requestedAt: nowIso(),
    approvedAt,
    deniedAt: null,
    expiresAt: isoPlusMinutes(15),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  services.store.saveApproval(approval);
  services.store.appendEvent({
    correlationId: plan.correlationId,
    runId: plan.runId,
    type: initialStatus === 'approved' ? 'approval.granted' : 'approval.requested',
    actor: initialStatus === 'approved' ? input.actor : 'agent',
    source: initialStatus === 'approved' ? 'user' : 'policy-engine',
    payload: {
      approvalId: approval.id,
      planId: plan.id,
      planHash: approval.authorizationScope.planHash,
      amount: approval.authorizationScope.amount,
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  return approval;
}

export function planHashFor(input: {
  productId: string;
  amount: { amount: number; currency: string };
  currency: string;
  quantity: number;
  policyId: string;
  policyVersion: number;
  policyInputHash: string;
}): string {
  return sha256({
    productId: input.productId,
    amountMinor: toMinorUnits(input.amount.amount),
    currency: input.currency,
    quantity: input.quantity,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    policyInputHash: input.policyInputHash,
  });
}

function toAutomationRun(input: {
  id: string;
  triggerEventId: string;
  runId: string;
  purchasePlanId: string;
  hook: string;
  status: 'sent' | 'failed' | 'unconfigured';
  responseSummary: string;
}) {
  return {
    id: input.id,
    triggerEventId: input.triggerEventId,
    runId: input.runId,
    purchasePlanId: input.purchasePlanId,
    zapierHook: input.hook,
    status: input.status === 'sent' ? ('sent' as const) : input.status === 'failed' ? ('failed' as const) : ('unconfigured' as const),
    responseSummary: input.responseSummary,
    executedAt: nowIso(),
    attempt: 1,
  };
}

function updateRunForPurchase(services: Services, run: RunT, plan: PurchasePlanT): void {
  services.store.saveRun({
    ...run,
    stage: plan.status === 'policy_blocked' ? 'done' : 'approve',
    status: plan.status === 'policy_blocked' ? 'blocked' : 'awaiting_approval',
    planId: plan.id,
    policyId: plan.policyResult.policyId,
    progress: 0.75,
    progressLabel: plan.status === 'policy_blocked' ? 'Blocked by policy' : 'Awaiting approval',
    blockedReason: plan.status === 'policy_blocked' ? 'policy_denied' : null,
    updatedAt: nowIso(),
  });
}