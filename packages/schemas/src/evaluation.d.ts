import { z } from 'zod';
export declare const ConstraintResult: z.ZodObject<{
    field: z.ZodString;
    label: z.ZodString;
    op: z.ZodEnum<{
        gte: "gte";
        lte: "lte";
        eq: "eq";
        gt: "gt";
        lt: "lt";
        between: "between";
    }>;
    expected: z.ZodString;
    actual: z.ZodNullable<z.ZodString>;
    satisfied: z.ZodNullable<z.ZodBoolean>;
    hard: z.ZodBoolean;
    evidence: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            provider_field: "provider_field";
            provider_page: "provider_page";
            computed: "computed";
            user_statement: "user_statement";
            unverified: "unverified";
        }>;
        source: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
        observedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ConstraintResultT = z.infer<typeof ConstraintResult>;
export declare const EvidenceQuality: z.ZodObject<{
    score: z.ZodNumber;
    verifiedFields: z.ZodArray<z.ZodString>;
    unverifiedFields: z.ZodArray<z.ZodString>;
    gaps: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type EvidenceQualityT = z.infer<typeof EvidenceQuality>;
export declare const Tradeoff: z.ZodObject<{
    aspect: z.ZodString;
    direction: z.ZodEnum<{
        pro: "pro";
        con: "con";
    }>;
    detail: z.ZodString;
    weight: z.ZodNumber;
}, z.core.$strip>;
export type TradeoffT = z.infer<typeof Tradeoff>;
export declare const ScoreComponent: z.ZodObject<{
    field: z.ZodString;
    label: z.ZodString;
    contribution: z.ZodNumber;
    weight: z.ZodNumber;
    reason: z.ZodString;
}, z.core.$strip>;
export type ScoreComponentT = z.infer<typeof ScoreComponent>;
export declare const Evaluation: z.ZodObject<{
    id: z.ZodString;
    intentId: z.ZodString;
    productId: z.ZodString;
    constraintResults: z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        label: z.ZodString;
        op: z.ZodEnum<{
            gte: "gte";
            lte: "lte";
            eq: "eq";
            gt: "gt";
            lt: "lt";
            between: "between";
        }>;
        expected: z.ZodString;
        actual: z.ZodNullable<z.ZodString>;
        satisfied: z.ZodNullable<z.ZodBoolean>;
        hard: z.ZodBoolean;
        evidence: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                provider_field: "provider_field";
                provider_page: "provider_page";
                computed: "computed";
                user_statement: "user_statement";
                unverified: "unverified";
            }>;
            source: z.ZodString;
            field: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodNumber;
            observedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    evidenceQuality: z.ZodObject<{
        score: z.ZodNumber;
        verifiedFields: z.ZodArray<z.ZodString>;
        unverifiedFields: z.ZodArray<z.ZodString>;
        gaps: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    tradeoffs: z.ZodArray<z.ZodObject<{
        aspect: z.ZodString;
        direction: z.ZodEnum<{
            pro: "pro";
            con: "con";
        }>;
        detail: z.ZodString;
        weight: z.ZodNumber;
    }, z.core.$strip>>;
    score: z.ZodNumber;
    scoreBreakdown: z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        label: z.ZodString;
        contribution: z.ZodNumber;
        weight: z.ZodNumber;
        reason: z.ZodString;
    }, z.core.$strip>>;
    disqualified: z.ZodArray<z.ZodString>;
    modelVersion: z.ZodString;
    rank: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type EvaluationT = z.infer<typeof Evaluation>;
export declare const ShortlistEntry: z.ZodObject<{
    rank: z.ZodNumber;
    productId: z.ZodString;
    evaluationId: z.ZodString;
    score: z.ZodNumber;
    rationale: z.ZodString;
}, z.core.$strip>;
export declare const Shortlist: z.ZodObject<{
    id: z.ZodString;
    runId: z.ZodString;
    intentId: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        rank: z.ZodNumber;
        productId: z.ZodString;
        evaluationId: z.ZodString;
        score: z.ZodNumber;
        rationale: z.ZodString;
    }, z.core.$strip>>;
    rejected: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        reason: z.ZodString;
        failedConstraints: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    explanation: z.ZodArray<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type ShortlistT = z.infer<typeof Shortlist>;
export declare const EvaluateRequest: z.ZodObject<{
    intentId: z.ZodString;
    productIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    runId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EvaluateRequestT = z.infer<typeof EvaluateRequest>;
//# sourceMappingURL=evaluation.d.ts.map