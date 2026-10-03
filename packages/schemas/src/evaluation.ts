import { z } from 'zod';
import { IsoDateTime } from './common.ts';
import { EvidenceRef, NumericOperator } from './product.ts';

export const ConstraintResult = z.object({
  field: z.string(),
  label: z.string(),
  op: NumericOperator,
  expected: z.string(),
  actual: z.string().nullable(),
  /** null when the candidate has no verified value for this field. */
  satisfied: z.boolean().nullable(),
  hard: z.boolean(),
  evidence: EvidenceRef.optional(),
});
export type ConstraintResultT = z.infer<typeof ConstraintResult>;

export const EvidenceQuality = z.object({
  /** 0..1 */
  score: z.number().min(0).max(1),
  verifiedFields: z.array(z.string()),
  /** Fields the UI must present as "Unverified". */
  unverifiedFields: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type EvidenceQualityT = z.infer<typeof EvidenceQuality>;

export const Tradeoff = z.object({
  aspect: z.string(),
  direction: z.enum(['pro', 'con']),
  detail: z.string(),
  /** Relative importance, 0..1. */
  weight: z.number().min(0).max(1),
});
export type TradeoffT = z.infer<typeof Tradeoff>;

export const ScoreComponent = z.object({
  field: z.string(),
  label: z.string(),
  /** Normalised 0..1 contribution. */
  contribution: z.number(),
  weight: z.number().min(0).max(1),
  reason: z.string(),
});
export type ScoreComponentT = z.infer<typeof ScoreComponent>;

export const Evaluation = z.object({
  id: z.string(),
  intentId: z.string(),
  productId: z.string(),
  constraintResults: z.array(ConstraintResult),
  evidenceQuality: EvidenceQuality,
  tradeoffs: z.array(Tradeoff),
  /** 0..100 deterministic score. */
  score: z.number().min(0).max(100),
  scoreBreakdown: z.array(ScoreComponent),
  /** Hard constraints that failed. */
  disqualified: z.array(z.string()),
  modelVersion: z.string(),
  rank: z.number().int().optional(),
  createdAt: IsoDateTime,
});
export type EvaluationT = z.infer<typeof Evaluation>;

export const ShortlistEntry = z.object({
  rank: z.number().int().min(1),
  productId: z.string(),
  evaluationId: z.string(),
  score: z.number(),
  /** Short plain-language reason, deterministic and auditable. */
  rationale: z.string(),
});

export const Shortlist = z.object({
  id: z.string(),
  runId: z.string(),
  intentId: z.string(),
  entries: z.array(ShortlistEntry),
  rejected: z.array(
    z.object({
      productId: z.string(),
      reason: z.string(),
      failedConstraints: z.array(z.string()),
    }),
  ),
  /** Narrative explanation of the decision — deterministic core, optional LLM prose. */
  explanation: z.array(z.string()),
  createdAt: IsoDateTime,
});
export type ShortlistT = z.infer<typeof Shortlist>;

export const EvaluateRequest = z.object({
  intentId: z.string(),
  productIds: z.array(z.string()).optional(),
  runId: z.string().optional(),
});
export type EvaluateRequestT = z.infer<typeof EvaluateRequest>;