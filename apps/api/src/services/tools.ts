import {
  buildShortlist,
  evaluateProduct,
  parseIntentDeterministic,
  ToolRegistry,
  type ToolContext,
  type ToolResult,
} from '@autopilot/agent-tools';
import { evaluatePolicy } from '@autopilot/policy-engine';
import { searchWithFallback } from '@autopilot/channel3';
import {
  ageInMinutes,
  isoPlusDays,
  money,
  newId,
  nowIso,
  toMinorUnits,
  type CatalogSearchRequestT,
  type EvaluationT,
  type EventTypeT,
  type IntentT,
  type ProductT,
  type PurchasePlanT,
  type ShortlistT,
  type ToolNameT,
} from '@autopilot/schemas';
import type { Services } from './container.ts';

/**
 * The typed tool surface exposed to the agent.
 *
 * Money-affecting tools (`create_paypal_order`, `capture_payment`,
 * `verify_order`, `trigger_automation`) are only reachable through the same
 * registry the HTTP routes use, so every attempt is validated against its zod
 * contract, recorded as a tool call, and traced — whether it came from a request
 * or from the agent.
 */
export function createToolRegistry(services: Services): ToolRegistry {
  return new ToolRegistry({
    parse_intent: (args: unknown) => {
      const input = args as { text: string };
      const policy = services.activePolicy();
      const parsed = parseIntentDeterministic(input.text, services.env.defaultCurrency);
      return {
        summary: `Parsed intent for "${input.text.slice(0, 60)}"`,
        data: {
          category: parsed.category,
          currency: parsed.currency,
          budgetMax: parsed.budgetMax,
          requireApproval: policy.requireApproval ? true : parsed.requireApproval,
          notes: parsed.notes,
        },
      };
    },

    validate_constraints: (args: unknown) => {
      const input = args as {
        constraints: { currency: string; numeric: Array<{ field: string; op: string; value: number; hard: boolean }>; budgetMax?: { amount: number; currency: string } };
      };
      const issues: string[] = [];
      for (const constraint of input.constraints.numeric) {
        if (!Number.isFinite(constraint.value)) issues.push(`${constraint.field} has a non-finite value`);
        if (constraint.hard && constraint.op === 'gte' && constraint.value < 0) {
          issues.push(`${constraint.field} cannot be a negative minimum`);
        }
      }
      if (input.constraints.budgetMax && input.constraints.budgetMax.amount <= 0) {
        issues.push('budgetMax must be positive');
      }
      return {
        summary: issues.length === 0 ? 'Constraints are internally consistent' : `Constraint issues: ${issues.join('; ')}`,
        data: { valid: issues.length === 0, issues },
        ...(issues.length > 0 ? { error: issues.join('; ') } : {}),
      };
    },

    catalog_search: async (args: unknown, ctx: ToolContext) => {
      const request = args as CatalogSearchRequestT;
      const response = await searchWithFallback(services.catalog, request);
      for (const product of response.products) {
        services.store.saveProduct(product, { runId: ctx.runId });
      }
      services.store.appendEvent({
        correlationId: ctx.correlationId,
        runId: ctx.runId,
        type: 'product.retrieved',
        actor: 'agent',
        source: response.provider,
        payload: {
          count: response.products.length,
          degraded: response.degraded,
          ...(response.degradedReason ? { degradedReason: response.degradedReason } : {}),
        },
      });
      return {
        summary: `Discovered ${response.products.length} candidate(s) via ${response.provider}${response.degraded ? ' (degraded)' : ''}`,
        data: {
          provider: response.provider,
          degraded: response.degraded,
          tookMs: response.tookMs,
          productIds: response.products.map((product) => product.id),
        },
      };
    },

    product_details: async (args: unknown) => {
      const input = args as { productId: string };
      const stored = services.store.getProduct(input.productId);
      const product = stored ?? (await services.catalog.primary.details(input.productId));
      if (!product) {
        return { summary: `Product ${input.productId} was not found`, error: 'NOT_FOUND' };
      }
      return {
        summary: `Loaded ${product.title}`,
        data: {
          productId: product.id,
          title: product.title,
          price: product.price,
          availability: product.availability.status,
          attributes: product.attributes.length,
          evidenceRefs: product.evidenceRefs.length,
        },
      };
    },

    compare_products: async (args: unknown, ctx: ToolContext) => {
      const input = args as { intentId: string; productIds: string[] };
      const intent = services.store.getIntent(input.intentId);
      if (!intent) return { summary: 'Intent not found', error: 'INTENT_NOT_FOUND' };
      const products = input.productIds
        .map((id) => services.store.getProduct(id))
        .filter((product): product is ProductT => Boolean(product));
      const { evaluations, shortlist } = evaluateAll(services, intent, products, ctx.runId);
      return {
        summary: `Compared ${products.length} candidate(s); top pick ${shortlist.entries[0]?.productId ?? 'none'}`,
        data: {
          scores: evaluations.map((evaluation) => ({ productId: evaluation.productId, score: evaluation.score })),
          shortlist: shortlist.entries.map((entry) => ({ rank: entry.rank, productId: entry.productId })),
        },
      };
    },

    evidence_lookup: async (args: unknown) => {
      const input = args as { productId: string; fields: string[] };
      const product = services.store.getProduct(input.productId);
      if (!product) return { summary: 'Product not found', error: 'NOT_FOUND' };
      const found = product.attributes.filter(
        (attribute) => input.fields.length === 0 || input.fields.includes(attribute.key),
      );
      return {
        summary: `Evidence for ${found.length} field(s) of ${product.title}`,
        data: found.map((attribute) => ({
          field: attribute.key,
          value: attribute.numericValue ?? attribute.value,
          evidence: attribute.evidence,
        })),
      };
    },

    score_candidate: async (args: unknown) => {
      const input = args as { intentId: string; productId: string };
      const intent = services.store.getIntent(input.intentId);
      const product = services.store.getProduct(input.productId);
      if (!intent || !product) return { summary: 'Intent or product not found', error: 'NOT_FOUND' };
      const { evaluations } = evaluateAll(services, intent, [product]);
      return {
        summary: `Scored ${product.title}: ${evaluations[0]?.score ?? 0}`,
        data: evaluations[0] ?? null,
      };
    },

    explain_tradeoffs: async (args: unknown) => {
      const input = args as { intentId: string; productIds: string[] };
      const intent = services.store.getIntent(input.intentId);
      if (!intent) return { summary: 'Intent not found', error: 'INTENT_NOT_FOUND' };
      const products = input.productIds
        .map((id) => services.store.getProduct(id))
        .filter((product): product is ProductT => Boolean(product));
      const { evaluations } = evaluateAll(services, intent, products);
      return {
        summary: `Explained ${evaluations.length} candidate trade-offs`,
        data: evaluations.map((evaluation) => ({
          productId: evaluation.productId,
          score: evaluation.score,
          tradeoffs: evaluation.tradeoffs,
          evidenceQuality: evaluation.evidenceQuality,
        })),
      };
    },

    policy_check: (args: unknown) => {
      const input = args as Parameters<typeof evaluatePolicy>[0];
      const policy = input.policyId ? services.store.getPolicy(input.policyId) ?? services.activePolicy() : services.activePolicy();
      const spent = services.store.spentSince(isoPlusDays(-1), policy.currency);
      const decision = evaluatePolicy(input, policy, {
        spentInWindow: money(spent, policy.currency),
      });
      return {
        summary: `Policy ${policy.name} v${policy.version} → ${decision.outcome}`,
        data: decision,
      };
    },

    create_paypal_order: async (args: unknown, ctx: ToolContext) => {
      const input = args as { purchasePlanId: string; description?: string };
      const plan = services.store.getPlan(input.purchasePlanId);
      if (!plan) return { summary: 'Purchase plan not found', error: 'PLAN_NOT_FOUND' };
      if (plan.paypalOrderId) {
        return {
          summary: `Order ${plan.paypalOrderId} already exists for this plan`,
          data: { paypalOrderId: plan.paypalOrderId, reused: true },
        };
      }
      const order = await services.gateway.createOrder({
        amount: plan.total,
        description: input.description ?? `Autopilot purchase ${plan.id}`,
        referenceId: plan.id,
        returnUrl: `${services.env.webUrl}/runs/${plan.runId}?paypal=approved`,
        cancelUrl: `${services.env.webUrl}/runs/${plan.runId}?paypal=cancelled`,
      });
      services.store.appendEvent({
        correlationId: ctx.correlationId,
        runId: plan.runId,
        type: 'paypal.order.created',
        actor: 'agent',
        source: services.gateway.provider,
        payload: {
          paypalOrderId: order.orderId,
          provider: order.provider,
          mode: order.mode,
          amount: plan.total,
        },
      });
      return {
        summary: `Created ${order.mode} order ${order.orderId} for ${plan.total.amount} ${plan.total.currency}`,
        data: { paypalOrderId: order.orderId, status: order.status, approvalUrl: order.approvalUrl },
      };
    },

    request_approval: async (args: unknown, ctx: ToolContext) => {
      const input = args as { purchasePlanId: string; planHash: string };
      const plan = services.store.getPlan(input.purchasePlanId);
      if (!plan) return { summary: 'Purchase plan not found', error: 'PLAN_NOT_FOUND' };
      const existing = services.store.getApprovalByPlan(plan.id);
      if (existing && existing.status === 'pending') {
        return {
          summary: `Approval ${existing.id} already pending`,
          data: { approvalId: existing.id, status: existing.status, expiresAt: existing.expiresAt },
        };
      }
      const approval = {
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
        status: 'pending' as const,
        actor: 'agent',
        requestedAt: nowIso(),
        approvedAt: null,
        deniedAt: null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        note: 'Explicit human authorisation required before any money moves.',
      };
      services.store.saveApproval(approval);
      services.store.appendEvent({
        correlationId: ctx.correlationId,
        runId: plan.runId,
        type: 'approval.requested',
        actor: 'agent',
        source: 'policy-engine',
        payload: {
          approvalId: approval.id,
          planId: plan.id,
          planHash: plan.planHash,
          amount: plan.total,
        },
      });
      return {
        summary: `Requested approval ${approval.id} for ${plan.total.amount} ${plan.total.currency}`,
        data: { approvalId: approval.id, status: approval.status, expiresAt: approval.expiresAt },
      };
    },

    capture_payment: async (args: unknown, ctx: ToolContext) => {
      const input = args as { purchasePlanId: string; approvalId: string; planHash: string };
      const plan = services.store.getPlan(input.purchasePlanId);
      const approval = services.store.getApproval(input.approvalId);
      if (!plan || !approval) return { summary: 'Plan or approval not found', error: 'NOT_FOUND' };
      if (!plan.paypalOrderId) {
        return { summary: 'No PayPal order exists for this plan', error: 'ORDER_NOT_FOUND' };
      }
      const capture = await services.gateway.captureOrder(plan.paypalOrderId, input.approvalId);
      services.store.appendEvent({
        correlationId: ctx.correlationId,
        runId: plan.runId,
        type: capture.captured ? 'payment.captured' : 'payment.failed',
        actor: 'agent',
        source: services.gateway.provider,
        severity: capture.captured ? 'info' : 'error',
        payload: {
          paypalOrderId: capture.orderId,
          transactionId: capture.transactionId,
          status: capture.status,
          provider: capture.provider,
          mode: capture.mode,
        },
      });
      return {
        summary: capture.captured
          ? `Captured ${capture.transactionId ?? capture.orderId} (${capture.mode})`
          : `Capture not completed: ${capture.status}`,
        ...(capture.captured ? {} : { error: capture.status }),
        data: {
          captured: capture.captured,
          transactionId: capture.transactionId,
          status: capture.status,
          amount: capture.amount,
        },
      };
    },

    get_paypal_order: async (args: unknown) => {
      const input = args as { paypalOrderId: string };
      const state = await services.gateway.getOrder(input.paypalOrderId);
      return {
        summary: `Order ${state.orderId} is ${state.status}`,
        data: {
          status: state.status,
          approved: state.approved,
          completed: state.completed,
          amount: state.amount,
          transactionId: state.transactionId,
        },
      };
    },

    verify_order: async (args: unknown, ctx: ToolContext) => {
      const input = args as { purchasePlanId: string };
      const plan = services.store.getPlan(input.purchasePlanId);
      if (!plan?.paypalOrderId) return { summary: 'Plan has no order to verify', error: 'PLAN_NOT_FOUND' };
      const state = await services.gateway.getOrder(plan.paypalOrderId);
      const matchesAmount =
        state.amount !== null && toMinorUnits(state.amount.amount) === toMinorUnits(plan.total.amount);
      const matchesCurrency = state.amount?.currency === plan.total.currency;
      const verified = state.completed && matchesAmount && matchesCurrency;
      services.store.appendEvent({
        correlationId: ctx.correlationId,
        runId: plan.runId,
        type: verified ? 'order.verified' : 'action.failed',
        actor: 'agent',
        source: services.gateway.provider,
        severity: verified ? 'info' : 'error',
        payload: {
          paypalOrderId: state.orderId,
          observedStatus: state.status,
          expectedAmount: plan.total,
          observedAmount: state.amount,
          amountMatches: matchesAmount,
          currencyMatches: matchesCurrency,
          verified,
        },
      });
      return {
        summary: verified
          ? `Independently verified ${state.transactionId ?? state.orderId} for ${plan.total.amount} ${plan.total.currency}`
          : `Verification failed: order is ${state.status} (amount match: ${matchesAmount}, currency match: ${matchesCurrency})`,
        ...(verified ? {} : { error: 'VERIFICATION_FAILED' }),
        data: {
          verified,
          observed: {
            status: state.status,
            amount: state.amount,
            transactionId: state.transactionId,
            checkedAt: state.checkedAt,
          },
        },
      };
    },

    trigger_automation: async (args: unknown, ctx: ToolContext) => {
      const input = args as { purchasePlanId: string; triggerEventId: string };
      const delivery = await deliverAutomation(services, input.purchasePlanId, input.triggerEventId, ctx.correlationId);
      return {
        summary: `Automation ${delivery.status}: ${delivery.responseSummary}`,
        ...(delivery.status === 'failed' ? { error: delivery.responseSummary } : {}),
        data: delivery,
      };
    },

    search_events: async (args: unknown) => {
      const input = args as {
        query?: string;
        types?: string[];
        severity?: Array<'info' | 'warn' | 'error'>;
        correlationId?: string;
        runId?: string;
        limit?: number;
      };
      const result = await services.auditIndex.search({
        ...(input.query ? { q: input.query } : {}),
        ...(input.types ? { types: input.types } : {}),
        ...(input.severity ? { severities: input.severity } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      });
      return {
        summary: `Searched ${result.total} audit event(s) via ${result.engine} index`,
        data: { total: result.total, engine: result.engine, tookMs: result.tookMs },
      };
    },
  });
}

/**
 * Calls a tool, records the call and its trace, and returns a typed result.
 * Failures are returned rather than thrown so callers can decide the policy
 * consequence of a failed tool.
 */
export async function callTool(
  services: Services,
  registry: ToolRegistry,
  name: ToolNameT,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { record, result, error } = await registry.callRecorded(name, args, ctx);
  services.store.saveToolCall(record);
  services.tracer.recordToolCall(record);
  if (error || !result) {
    return {
      ok: false,
      durationMs: record.durationMs,
      summary: record.error ?? 'tool failed',
      error: error ?? 'tool failed',
    };
  }
  return result;
}

export async function deliverAutomation(
  services: Services,
  purchasePlanId: string,
  triggerEventId: string,
  correlationId: string,
): Promise<{
  id: string;
  status: 'sent' | 'failed' | 'unconfigured';
  responseSummary: string;
  eventType: EventTypeT;
}> {
  const plan = services.store.getPlan(purchasePlanId);
  const payment = services.store.getPaymentByPlan(purchasePlanId);
  const product = plan?.product;
  const delivery = await services.automation.deliver({
    eventId: triggerEventId,
    eventType: 'automation.triggered',
    occurredAt: nowIso(),
    correlationId,
    runId: plan?.runId ?? null,
    purchasePlanId,
    verified: payment?.verificationState === 'verified',
    payment: payment
      ? {
          provider: payment.provider,
          mode: payment.mode,
          paypalOrderId: payment.paypalOrderId,
          transactionId: payment.transactionId,
          amount: { amount: payment.amount.amount, currency: payment.amount.currency },
          status: payment.status,
          capturedAt: payment.capturedAt,
        }
      : null,
    product: product
      ? { id: product.id, title: product.title, merchant: product.provider }
      : null,
    policy: plan
      ? {
          policyId: plan.policyResult.policyId,
          policyVersion: plan.policyResult.policyVersion,
          outcome: plan.policyResult.outcome,
        }
      : null,
  });

  const eventType: EventTypeT = delivery.status === 'sent' ? 'automation.triggered' : 'automation.failed';
  services.store.appendEvent({
    correlationId,
    runId: plan?.runId ?? null,
    type: eventType,
    actor: 'agent',
    source: 'zapier',
    severity: delivery.status === 'sent' ? 'info' : delivery.status === 'unconfigured' ? 'warn' : 'error',
    payload: {
      purchasePlanId,
      triggerEventId,
      status: delivery.status,
      responseSummary: delivery.responseSummary,
    },
  });

  return {
    id: newId('aut'),
    status: delivery.status,
    responseSummary: delivery.responseSummary,
    eventType,
  };
}

export function evaluateAll(
  services: Services,
  intent: IntentT,
  products: ProductT[],
  runId?: string,
): { evaluations: EvaluationT[]; shortlist: ShortlistT } {
  const evaluations = products.map((product) => {
    const evaluation = evaluateProduct(intent, product);
    if (runId) services.store.saveEvaluation(evaluation, runId);
    return evaluation;
  });
  const shortlist = buildShortlist({
    runId: runId ?? `eval_${intent.id}`,
    intent,
    evaluations,
    products,
  });
  return { evaluations, shortlist };
}

export function authoriseSentence(plan: PurchasePlanT): string {
  return `I authorise Autopilot to pay ${plan.product.title} (${plan.total.amount} ${plan.total.currency}) to ${plan.product.provider} under policy ${plan.policyResult.policyId} v${plan.policyResult.policyVersion}.`;
}

export function quoteAgeMinutes(quotedAt: string): number {
  return Math.max(0, ageInMinutes(quotedAt));
}