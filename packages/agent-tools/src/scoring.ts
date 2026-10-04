import {
  newId,
  nowIso,
  toMinorUnits,
  type ConstraintResultT,
  type EvaluationT,
  type EvidenceQualityT,
  type IntentT,
  type ProductT,
  type ScoreComponentT,
  type ShortlistT,
  type TradeoffT,
} from '@autopilot/schemas';

export interface ScoreWeights {
  constraints: number;
  budget: number;
  evidence: number;
  availability: number;
  value: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  constraints: 0.5,
  budget: 0.2,
  evidence: 0.15,
  availability: 0.1,
  value: 0.05,
};

function attributeValue(product: ProductT, field: string): number | null {
  const attr = product.attributes.find((a) => a.key === field);
  if (!attr) return null;
  if (attr.numericValue !== undefined && attr.numericValue !== null) return attr.numericValue;
  if (typeof attr.value === 'number') return attr.value;
  if (typeof attr.value === 'string') {
    const parsed = Number.parseFloat(attr.value.replace(/[^0-9.-]/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function satisfies(op: string, expected: number, actual: number, valueMax?: number): boolean {
  switch (op) {
    case 'gte':
      return actual >= expected;
    case 'gt':
      return actual > expected;
    case 'lte':
      return actual <= expected;
    case 'lt':
      return actual < expected;
    case 'eq':
      return Math.abs(actual - expected) < 0.001;
    case 'between':
      return valueMax === undefined ? actual >= expected : actual >= expected && actual <= valueMax;
    default:
      return false;
  }
}

/**
 * Evaluate one candidate against the structured intent. Fully deterministic:
 * the same product + intent always produce the same score, constraint results,
 * evidence gaps and trade-offs. That is what makes the Decision screen honest.
 */
export function evaluateProduct(
  intent: IntentT,
  product: ProductT,
  options: { weights?: ScoreWeights; modelVersion?: string } = {},
): EvaluationT {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const constraintResults: ConstraintResultT[] = [];
  const disqualified: string[] = [];
  const tradeoffs: TradeoffT[] = [];
  const scoreParts: ScoreComponentT[] = [];

  // ---- hard + soft constraints -----------------------------------------
  const allConstraints = [
    ...intent.constraints.numeric,
    ...(intent.constraints.budgetMax
      ? [
          {
            field: 'price',
            label: 'Budget ceiling',
            op: 'lte' as const,
            value: intent.constraints.budgetMax.amount,
            unit: intent.constraints.budgetMax.currency,
            source: 'user' as const,
            weight: 1,
            hard: true,
          },
        ]
      : []),
    ...(intent.constraints.budgetMin
      ? [
          {
            field: 'price',
            label: 'Budget floor',
            op: 'gte' as const,
            value: intent.constraints.budgetMin.amount,
            unit: intent.constraints.budgetMin.currency,
            source: 'user' as const,
            weight: 1,
            hard: true,
          },
        ]
      : []),
  ];

  for (const constraint of allConstraints) {
    const actual =
      constraint.field === 'price' ? product.price.amount : attributeValue(product, constraint.field);
    const evidence =
      constraint.field === 'price'
        ? product.evidenceRefs[0]
        : product.attributes.find((a) => a.key === constraint.field)?.evidence;

    const satisfied = actual === null ? null : satisfies(constraint.op, constraint.value, actual, constraint.valueMax);
    constraintResults.push({
      field: constraint.field,
      label: constraint.label,
      op: constraint.op,
      expected: formatExpected(constraint),
      actual: actual === null ? null : String(actual),
      satisfied,
      hard: constraint.hard,
      evidence,
    });

    if (satisfied === false && constraint.hard) {
      disqualified.push(
        `${constraint.label} ${describeOp(constraint.op)} ${formatExpected(constraint)} (actual ${actual})`,
      );
    }
  }

  for (const attribute of product.attributes) {
    if (attribute.value === null || attribute.evidence.kind === 'unverified') {
      const existing = constraintResults.find((c) => c.field === attribute.key);
      if (!existing) {
        constraintResults.push({
          field: attribute.key,
          label: attribute.label,
          op: 'eq',
          expected: 'verified provider value',
          actual: null,
          satisfied: null,
          hard: false,
          evidence: attribute.evidence,
        });
      }
    }
  }

  const scored = constraintResults.filter((c) => c.satisfied !== null);
  const satisfiedHard = scored.filter((c) => c.hard && c.satisfied);
  const hardTotal = constraintResults.filter((c) => c.hard && c.satisfied !== null).length;
  const satisfiedSoft = scored.filter((c) => !c.hard && c.satisfied);

  const constraintScore =
    constraintResults.length === 0
      ? 0.5
      : (hardTotal === 0
          ? 1
          : satisfiedHard.length / hardTotal) * 0.8 +
        (scored.length === 0 ? 0 : (satisfiedSoft.length / Math.max(1, scored.length - satisfiedHard.length)) * 0.2);

  scoreParts.push({
    field: 'constraints',
    label: 'Constraint satisfaction',
    contribution: round2(constraintScore * weights.constraints),
    weight: weights.constraints,
    reason: `${satisfiedHard.length}/${hardTotal} hard constraints met, ${satisfiedSoft.length} soft preferences matched.`,
  });

  // ---- budget headroom --------------------------------------------------
  let budgetScore = 0.5;
  const budgetMax = intent.constraints.budgetMax;
  if (budgetMax) {
    const ratio = product.price.amount / budgetMax.amount;
    budgetScore = ratio <= 1 ? Math.min(1, 0.75 + (1 - ratio) * 0.5) : Math.max(0, 0.75 - (ratio - 1) * 2);
    tradeoffs.push({
      aspect: 'Budget',
      direction: ratio <= 1 ? 'pro' : 'con',
      detail:
        ratio <= 1
          ? `Costs ${fmt(product.price.amount)} — ${fmt(budgetMax.amount - product.price.amount)} under the stated ceiling.`
          : `Costs ${fmt(product.price.amount)}, which is ${fmt(product.price.amount - budgetMax.amount)} over the stated ceiling.`,
      weight: 0.8,
    });
  }
  scoreParts.push({
    field: 'budget',
    label: 'Budget fit',
    contribution: round2(budgetScore * weights.budget),
    weight: weights.budget,
    reason: budgetMax
      ? `Price is ${((product.price.amount / budgetMax.amount) * 100).toFixed(0)}% of the stated budget.`
      : 'No budget constraint in the intent.',
  });

  // ---- evidence quality -------------------------------------------------
  const evidenceQuality = assessEvidence(product, constraintResults);
  scoreParts.push({
    field: 'evidence',
    label: 'Evidence quality',
    contribution: round2(evidenceQuality.score * weights.evidence),
    weight: weights.evidence,
    reason: `${evidenceQuality.verifiedFields.length} verified fields, ${evidenceQuality.unverifiedFields.length} unverified.`,
  });

  // ---- availability -----------------------------------------------------
  const availabilityScore =
    product.availability.status === 'in_stock'
      ? 1
      : product.availability.status === 'preorder'
        ? 0.6
        : product.availability.status === 'backorder'
          ? 0.4
          : product.availability.status === 'unknown'
            ? 0.2
            : 0;
  scoreParts.push({
    field: 'availability',
    label: 'Availability',
    contribution: round2(availabilityScore * weights.availability),
    weight: weights.availability,
    reason: `Provider reports "${product.availability.status}".`,
  });

  // ---- value (performance per dollar) ----------------------------------
  const valueSignal = computeValueSignal(intent, product);
  scoreParts.push({
    field: 'value',
    label: 'Performance per dollar',
    contribution: round2(valueSignal.score * weights.value),
    weight: weights.value,
    reason: valueSignal.reason,
  });

  // ---- trade-offs -------------------------------------------------------
  const bestConstraint = scored
    .filter((c) => c.satisfied)
    .sort((a, b) => Number(b.hard) - Number(a.hard))[0];
  if (bestConstraint) {
    tradeoffs.push({
      aspect: bestConstraint.label,
      direction: 'pro',
      detail: `Meets ${bestConstraint.label} ${describeOp(bestConstraint.op)} ${bestConstraint.expected} with provider evidence.`,
      weight: 0.9,
    });
  }
  const misses = scored.filter((c) => !c.satisfied && !c.hard);
  for (const miss of misses.slice(0, 2)) {
    tradeoffs.push({
      aspect: miss.label,
      direction: 'con',
      detail: `Does not meet ${miss.label} ${describeOp(miss.op)} ${miss.expected} (actual ${miss.actual}).`,
      weight: 0.5,
    });
  }
  for (const unverified of evidenceQuality.unverifiedFields.slice(0, 2)) {
    tradeoffs.push({
      aspect: 'Unverified attribute',
      direction: 'con',
      detail: `${unverified} could not be verified against a provider field — treat it as unknown, not as fact.`,
      weight: 0.4,
    });
  }
  if (product.availability.status !== 'in_stock') {
    tradeoffs.push({
      aspect: 'Availability',
      direction: 'con',
      detail: `Availability is "${product.availability.status}" rather than confirmed in stock.`,
      weight: 0.6,
    });
  }

  const raw = scoreParts.reduce((acc, part) => acc + part.contribution, 0);
  const score = Math.max(0, Math.min(100, round2(raw * 100)));

  return {
    id: newId('eval'),
    intentId: intent.id,
    productId: product.id,
    constraintResults,
    evidenceQuality,
    tradeoffs,
    score: disqualified.length > 0 ? Math.min(score, 40) : score,
    scoreBreakdown: scoreParts,
    disqualified,
    modelVersion: options.modelVersion ?? 'deterministic-scorer/1.0',
    createdAt: nowIso(),
  };
}

export function assessEvidence(
  product: ProductT,
  constraintResults: ConstraintResultT[],
): EvidenceQualityT {
  const verified = new Set<string>();
  const unverified = new Set<string>();
  const gaps: string[] = [];

  for (const attribute of product.attributes) {
    if (attribute.evidence.kind === 'unverified' || attribute.value === null) {
      unverified.add(attribute.label);
    } else {
      verified.add(attribute.label);
    }
  }
  for (const constraint of constraintResults) {
    if (constraint.satisfied === null) {
      unverified.add(constraint.label);
      gaps.push(`${constraint.label} has no verified provider value for ${product.title}.`);
    }
  }
  if (product.availability.status === 'unknown') {
    gaps.push('Availability was not confirmed by the provider.');
  }
  if (product.evidenceRefs.length === 0) {
    gaps.push('No evidence references were returned with this record.');
  }

  const total = verified.size + unverified.size;
  const score = total === 0 ? 0 : round2(verified.size / total);

  return {
    score,
    verifiedFields: [...verified],
    unverifiedFields: [...unverified],
    gaps,
  };
}

function computeValueSignal(intent: IntentT, product: ProductT): { score: number; reason: string } {
  const weighted = intent.constraints.numeric.filter((c) => attributeValue(product, c.field) !== null);
  if (weighted.length === 0 || product.price.amount <= 0) {
    return { score: 0.5, reason: 'No comparable attributes available for a value calculation.' };
  }
  let achieved = 0;
  let demanded = 0;
  for (const constraint of weighted) {
    const actual = attributeValue(product, constraint.field)!;
    demanded += Math.max(constraint.value, 1);
    achieved += Math.min(actual, Math.max(constraint.value, 1));
  }
  const attainment = demanded === 0 ? 0.5 : achieved / demanded;
  const priceFactor = 1 / (1 + Math.max(0, product.price.amount) / 2000);
  return {
    score: round2(attainment * 0.7 + priceFactor * 0.3),
    reason: `Meets ${((attainment || 0) * 100).toFixed(0)}% of the demanded specification at ${fmt(product.price.amount)}.`,
  };
}

/** Rank evaluated candidates and record why the rejects were rejected. */
export function buildShortlist(input: {
  runId: string;
  intent: IntentT;
  evaluations: EvaluationT[];
  products: ProductT[];
  limit?: number;
}): ShortlistT {
  const limit = input.limit ?? 5;
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const eligible = input.evaluations
    .filter((e) => e.disqualified.length === 0)
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
  const rejected = input.evaluations
    .filter((e) => e.disqualified.length > 0)
    .map((e) => ({
      productId: e.productId,
      reason: `Failed ${e.disqualified.length} hard constraint${e.disqualified.length > 1 ? 's' : ''}.`,
      failedConstraints: e.disqualified,
    }));

  const entries = eligible.slice(0, limit).map((evaluation, index) => {
    const rank = index + 1;
    evaluation.rank = rank;
    return {
      rank,
      productId: evaluation.productId,
      evaluationId: evaluation.id,
      score: evaluation.score,
      rationale: rationaleFor(evaluation, byId.get(evaluation.productId)),
    };
  });

  const top = entries[0];
  const explanation: string[] = [];
  if (top) {
    const product = byId.get(top.productId);
    explanation.push(
      `${product?.title ?? top.productId} leads with a deterministic score of ${top.score}/100 against the stated constraints.`,
    );
  }
  if (entries.length > 1) {
    const second = byId.get(entries[1]!.productId);
    explanation.push(
      `The gap to ${second?.title ?? entries[1]!.productId} is ${(entries[0]!.score - entries[1]!.score).toFixed(1)} points, driven by ${topDifference(input.evaluations, entries[0]!.evaluationId, entries[1]!.evaluationId)}.`,
    );
  } else if (entries.length === 1) {
    explanation.push('Only one candidate satisfied every hard constraint.');
  }
  if (rejected.length > 0) {
    explanation.push(
      `${rejected.length} candidate${rejected.length > 1 ? 's were' : ' was'} excluded for failing a hard constraint — see the rejected list rather than silently dropped.`,
    );
  }
  const unverified = input.evaluations
    .flatMap((e) => e.evidenceQuality.unverifiedFields)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (unverified.length > 0) {
    explanation.push(
      `Fields that remain unverified and are not presented as fact: ${unverified.join(', ')}.`,
    );
  }
  explanation.push(
    'No hidden criteria: the score is the weighted sum of the breakdown shown on each card, with weights fixed in code.',
  );

  return {
    id: newId('sl'),
    runId: input.runId,
    intentId: input.intent.id,
    entries,
    rejected,
    explanation,
    createdAt: nowIso(),
  };
}

function topDifference(evaluations: EvaluationT[], aId: string, bId: string): string {
  const a = evaluations.find((e) => e.id === aId);
  const b = evaluations.find((e) => e.id === bId);
  if (!a || !b) return 'the score breakdown';
  let best = { delta: 0, field: 'score' };
  for (const part of a.scoreBreakdown) {
    const other = b.scoreBreakdown.find((p) => p.field === part.field);
    const delta = part.contribution - (other?.contribution ?? 0);
    if (Math.abs(delta) > Math.abs(best.delta)) best = { delta, field: part.label };
  }
  return `${best.field} (${best.delta > 0 ? '+' : ''}${(best.delta * 100).toFixed(1)} pts)`;
}

function rationaleFor(evaluation: EvaluationT, product: ProductT | undefined): string {
  const pros = evaluation.tradeoffs.filter((t) => t.direction === 'pro').slice(0, 2);
  const cons = evaluation.tradeoffs.filter((t) => t.direction === 'con').slice(0, 1);
  const parts = [...pros, ...cons].map((t) => t.detail);
  const head = product ? `${product.title} at ${fmt(product.price.amount)}` : evaluation.productId;
  return parts.length ? `${head}: ${parts.join(' ')}` : `${head}: satisfies every hard constraint.`;
}

function describeOp(op: string): string {
  switch (op) {
    case 'gte':
      return 'at least';
    case 'gt':
      return 'more than';
    case 'lte':
      return 'at most';
    case 'lt':
      return 'under';
    case 'eq':
      return 'exactly';
    case 'between':
      return 'between';
    default:
      return op;
  }
}

function formatExpected(constraint: { op: string; value: number; valueMax?: number; unit?: string }): string {
  const unit = constraint.unit ? ` ${constraint.unit}` : '';
  if (constraint.op === 'between') return `${constraint.value}–${constraint.valueMax ?? constraint.value}${unit}`;
  return `${constraint.value}${unit}`;
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function round2(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function priceMinor(product: ProductT): number {
  return toMinorUnits(product.price.amount);
}