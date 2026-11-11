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
  type AutomationRunT,
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
  const live = await services.catalog.primary.details(input.productId).catch(() => undefined);
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
  if (!live) {
    riskFlags.push({
      code: 'price_not_refreshed',
      severity: 'warn',
      message:
        'The catalog provider did not return a live record for this product, so the plan uses the price captured during discovery.',
    });
  }
  // Risk assessment (KERNEL when configured, Autopilot's own deterministic
  // checks otherwise). It informs the human; it never replaces policy.
  try {
    const assessment = await services.kernel.assess({
      correlationId: run.correlationId,
      amount: total.amount,
      currency: total.currency,
      category: product.category,
      merchant: product.provider,
      productTitle: product.title,
      policyOutcome: decision.outcome,
    });
    for (const signal of [...assessment.signals, ...assessment.deterministicChecks]) {
      riskFlags.push({
        code: `risk_${String(signal.label).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        severity: signal.score >= 0.5 ? 'warn' : 'info',
        message: `${signal.detail} (${assessment.live ? 'KERNEL' : 'Autopilot deterministic check'})`,
      });
    }
    store.appendEvent({
      correlationId: run.correlationId,
      runId: run.id,
      type: 'policy.checked',
      actor: 'system',
      source: assessment.live ? 'kernel' : 'risk-checks',
      payload: { kind: 'risk_assessment', live: assessment.live, riskScore: assessment.riskScore, summary: assessment.summary },
    });
  } catch {
    riskFlags.push({
      code: 'risk_assessment_unavailable',
      severity: 'info',
      message: 'The risk assessment could not be completed; policy rules were still enforced.',
    });
  }
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

  updateRunForPurchase(services, store.getRun(run.id) ?? run, plan);

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
  if (!paypalOrderId) {
    store.savePlan({ ...plan, status: 'failed', updatedAt: nowIso() });
    throw errors.providerUnavailable('The payment provider did not return an order id.', { planId: plan.id });
  }
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
    if (!requested.ok || !approval) {
      throw new ApiHttpError(500, 'APPROVAL_REQUEST_FAILED', 'The approval request could not be recorded. Prepare the purchase again.', {
        planId: plan.id,
      });
    }
    withOrder = store.savePlan({ ...withOrder, approvalId: approval.id, status: 'awaiting_approval', updatedAt: nowIso() });
  } else {
    approval = grantApproval(services, withOrder, { actor: 'policy:auto-approve', planHash, note: 'Policy allowed automatic approval for this amount.' });
    withOrder = store.savePlan({ ...withOrder, approvalId: approval.id, status: 'approved', updatedAt: nowIso() });
  }

  if (withOrder.status === 'approved') {
    const current = store.getRun(run.id);
    if (current) {
      store.saveRun({ ...current, stage: 'pay', status: 'running', progressLabel: 'Approved by policy — ready to execute', updatedAt: nowIso() });
    }
  }
  const payment = store.getPaymentByPlan(withOrder.id) ?? null;
  const finalPlan = store.getPlan(withOrder.id) ?? withOrder;
  return { plan: finalPlan, approval, payment, approvalUrl, blocked: false };
}

/** Plan states in which a human approval can still be recorded. */
const APPROVABLE_STATUSES = new Set<PurchasePlanT['status']>([
  'draft',
  'paypal_order_created',
  'awaiting_approval',
  'approved',
]);

/** Plan states from which a payment can never be executed. */
const DEAD_STATUSES = new Set<PurchasePlanT['status']>(['policy_blocked', 'cancelled', 'expired', 'stale']);

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
  let existing = store.getApprovalByPlan(plan.id);
  if (existing?.status === 'approved' || existing?.status === 'consumed') {
    // Replays are answered from the record. In particular a plan that is
    // already paid must never be pushed back to "approved".
    return { approval: existing, plan };
  }
  if (!APPROVABLE_STATUSES.has(plan.status)) {
    throw errors.conflict('PLAN_NOT_APPROVABLE', `This plan is ${plan.status} and can no longer be approved.`, {
      planId: plan.id,
      status: plan.status,
    });
  }
  assertPlanFresh(services, plan);
  if (existing && existing.status !== 'pending') {
    // denied / revoked / expired requests are final; a fresh plan is required.
    throw errors.conflict(
      existing.status === 'expired' ? 'APPROVAL_EXPIRED' : 'APPROVAL_NOT_PENDING',
      `This approval request is ${existing.status}. Re-open the purchase to request a fresh one.`,
      { planId: plan.id, approvalStatus: existing.status },
    );
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
    // No request was recorded (for example the request step failed). Record it
    // now so the audit trail still shows request → grant, then grant it below.
    existing = grantApproval(
      services,
      plan,
      { actor: 'agent', planHash: input.planHash, note: 'Approval requested when the human approved the plan.' },
      'pending',
    );
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
  automation: AutomationRunT | null;
}

/**
 * One capture per plan at a time. Two concurrent requests (a double click, a
 * client retry racing the original) share the same execution instead of both
 * reaching the payment provider.
 */
const inFlightCaptures = new WeakMap<object, Map<string, Promise<CaptureOutcome>>>();

/**
 * Executes the payment and then verifies it independently.
 *
 * Capture is guarded by an approval bound to the current plan hash, is
 * idempotent, and never reports success from the capture call alone — the order
 * is re-read from the provider before any automation may fire.
 */
export function capturePurchase(
  services: Services,
  planId: string,
  input: { actor: string; planHash: string; payerId?: string },
): Promise<CaptureOutcome> {
  let perStore = inFlightCaptures.get(services.store);
  if (!perStore) {
    perStore = new Map();
    inFlightCaptures.set(services.store, perStore);
  }
  const running = perStore.get(planId);
  if (running) return running;
  const captures = perStore;
  const execution = executeCapture(services, planId, input).finally(() => {
    captures.delete(planId);
  });
  captures.set(planId, execution);
  return execution;
}

async function executeCapture(
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
    if (existingPayment.verificationState === 'verified') {
      // Already paid and verified: answer from the record. Re-running the
      // verification here would fire the post-purchase automation again.
      return {
        payment: existingPayment,
        plan,
        automation: store.listAutomationsByPlan(plan.id)[0] ?? null,
      };
    }
    // Captured but not verified yet (the provider was unreachable): verify now.
    return verifyPlan(services, plan.id, existingPayment);
  }

  if (DEAD_STATUSES.has(plan.status)) {
    throw errors.conflict('PLAN_NOT_PAYABLE', `This plan is ${plan.status}, so no payment can be executed for it.`, {
      planId: plan.id,
      status: plan.status,
    });
  }
  assertPlanFresh(services, plan);
  assertPolicyStillAllows(services, plan);

  // With a real provider the payer approves inside PayPal. Capturing before
  // that is not a failure of the plan — it just is not ready yet.
  if (services.gateway.mode !== 'simulated') {
    let state;
    try {
      state = await services.gateway.getOrder(plan.paypalOrderId);
    } catch (error) {
      throw errors.providerUnavailable(
        `The payment provider could not be reached, so nothing was captured: ${error instanceof Error ? error.message : String(error)}`,
        { planId: plan.id },
      );
    }
    if (!state.approved && !state.completed) {
      throw errors.conflict(
        'PAYER_APPROVAL_REQUIRED',
        'The payer has not approved this order with PayPal yet. Open the approval link, approve the payment, then capture again.',
        { planId: plan.id, paypalOrderId: plan.paypalOrderId, approvalUrl: state.approvalUrl, orderStatus: state.status },
      );
    }
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

  const capturedResult = captured.data as
    | { captured?: boolean; transactionId?: string | null; status?: string; amount?: MoneyT | null }
    | undefined;
  if (!captured.ok || capturedResult?.captured !== true) {
    const reason = captured.error ?? capturedResult?.status ?? 'capture failed';
    if (reason === 'PAYER_APPROVAL_REQUIRED') {
      // Not a failure: the plan stays approved and can be captured once the
      // payer has approved the order with the provider.
      store.savePayment({ ...payment, status: 'awaiting_approval', lastError: reason, updatedAt: nowIso() });
      store.savePlan({ ...plan, status: 'approved', updatedAt: nowIso() });
      throw errors.conflict(
        'PAYER_APPROVAL_REQUIRED',
        'The payer has not approved this order with the payment provider yet. Approve it there, then capture again.',
        { planId: plan.id, paypalOrderId: plan.paypalOrderId },
      );
    }
    const failed = store.savePayment({
      ...payment,
      status: 'failed',
      lastError: reason,
      updatedAt: nowIso(),
    });
    store.savePlan({ ...plan, status: 'failed', updatedAt: nowIso() });
    const run = store.getRun(plan.runId);
    if (run) store.saveRun({ ...run, status: 'failed', stage: 'done', blockedReason: reason, updatedAt: nowIso() });
    throw new ApiHttpError(402, 'PAYMENT_FAILED', `Payment was not captured: ${reason}`, {
      paymentId: failed.id,
    });
  }

  const capturedPayment = store.savePayment({
    ...payment,
    status: 'captured',
    transactionId: capturedResult.transactionId ?? null,
    capturedAt: nowIso(),
    amount: capturedResult.amount ?? payment.amount,
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
  const outcome = verification.data as { verified?: boolean; observed?: Record<string, unknown> } | undefined;
  const run = store.getRun(plan.runId);

  if (!outcome) {
    // The provider could not be read at all. That says nothing about the
    // payment, so it stays "captured, unverified" and can be re-verified by
    // calling capture again — it is not recorded as a failed payment.
    if (run) {
      store.saveRun({
        ...run,
        stage: 'verify',
        status: 'running',
        progressLabel: 'Captured — verification pending',
        updatedAt: nowIso(),
      });
    }
    throw errors.providerUnavailable(
      `The payment was captured but could not be verified yet: ${verification.error ?? 'provider unreachable'}. Retry the capture call to verify it; the payer will not be charged again.`,
      { planId: plan.id, paymentId: payment.id, verificationState: payment.verificationState },
    );
  }

  const observed = outcome.observed ?? {};
  const verified = verification.ok === true && outcome.verified === true;
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

  if (!verified) {
    if (run) {
      store.saveRun({
        ...run,
        status: 'failed',
        stage: 'done',
        progress: 1,
        progressLabel: 'Verification failed',
        blockedReason: 'The provider state did not match the approved plan.',
        updatedAt: nowIso(),
      });
    }
    return { payment: verifiedPayment, plan: verifiedPlan, automation: null };
  }

  // Automation may only fire on verified payment state.
  const delivery = await deliverAutomation(services, plan.id, newId('evt'), plan.correlationId);

  if (run) {
    store.saveRun({
      ...run,
      stage: 'done',
      status: 'completed',
      progress: 1,
      progressLabel: 'Completed',
      planId: plan.id,
      summary: `Purchased ${plan.product.title} for ${plan.total.amount} ${plan.total.currency} (${services.gateway.mode}).`,
      blockedReason: null,
      updatedAt: nowIso(),
    });
  }

  return { payment: verifiedPayment, plan: verifiedPlan, automation: delivery.automation };
}

/** A plan is only executable while its price quote is still fresh. */
function assertPlanFresh(services: Services, plan: PurchasePlanT): void {
  const expiresAt = Date.parse(plan.expiresAt);
  if (Number.isNaN(expiresAt) || expiresAt >= Date.now()) return;
  services.store.savePlan({ ...plan, status: 'expired', updatedAt: nowIso() });
  services.store.appendEvent({
    correlationId: plan.correlationId,
    runId: plan.runId,
    type: 'plan.invalidated',
    actor: 'system',
    source: 'policy-engine',
    severity: 'warn',
    payload: { planId: plan.id, reason: 'quote_expired', expiresAt: plan.expiresAt },
  });
  throw errors.conflict(
    'PLAN_EXPIRED',
    'The price quote behind this plan has expired. Prepare the purchase again to get a fresh price before paying.',
    { planId: plan.id, expiresAt: plan.expiresAt },
  );
}

/**
 * Policy is checked again at the moment money would move. Limits may have been
 * tightened, the emergency stop engaged, or other payments captured since the
 * plan was approved — an approval never outranks the current policy.
 */
function assertPolicyStillAllows(services: Services, plan: PurchasePlanT): void {
  const store = services.store;
  const active = services.activePolicy();
  const policy = store.getPolicy(plan.policyResult.policyId) ?? active;
  const decision = evaluatePolicy(
    {
      amount: plan.total,
      category: plan.product.category,
      currency: plan.total.currency,
      merchant: plan.product.provider,
      productId: plan.product.id,
      quotedAt: plan.quotedAt,
      availability: plan.product.availability.status,
      correlationId: plan.correlationId,
    },
    { ...policy, emergencyStop: policy.emergencyStop || active.emergencyStop },
    { spentInWindow: money(store.spentSince(isoPlusDays(-1), policy.currency), policy.currency) },
  );
  if (decision.outcome !== 'deny') return;
  const blockingRules = decision.rules.filter((rule) => rule.outcome === 'block').map((rule) => rule.rule);
  store.appendEvent({
    correlationId: plan.correlationId,
    runId: plan.runId,
    type: 'action.failed',
    actor: 'system',
    source: 'policy-engine',
    severity: 'warn',
    payload: { planId: plan.id, stage: 'capture', reason: 'policy_denied_at_capture', blockingRules },
  });
  throw errors.policyBlocked(
    `Policy no longer allows this payment (${blockingRules.join(', ')}), so nothing was captured.`,
    { planId: plan.id, blockingRules },
  );
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