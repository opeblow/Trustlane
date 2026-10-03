import { z } from 'zod';
export declare const ConstraintSource: z.ZodEnum<{
    default: "default";
    user: "user";
    policy: "policy";
    inferred: "inferred";
}>;
export declare const NumericConstraint: z.ZodObject<{
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
    value: z.ZodNumber;
    valueMax: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodOptional<z.ZodString>;
    source: z.ZodEnum<{
        default: "default";
        user: "user";
        policy: "policy";
        inferred: "inferred";
    }>;
    weight: z.ZodDefault<z.ZodNumber>;
    hard: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type NumericConstraintT = z.infer<typeof NumericConstraint>;
export declare const IntentConstraints: z.ZodObject<{
    currency: z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>;
    budgetMax: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    budgetMin: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    numeric: z.ZodArray<z.ZodObject<{
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
        value: z.ZodNumber;
        valueMax: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodString>;
        source: z.ZodEnum<{
            default: "default";
            user: "user";
            policy: "policy";
            inferred: "inferred";
        }>;
        weight: z.ZodDefault<z.ZodNumber>;
        hard: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    keywords: z.ZodArray<z.ZodString>;
    preferences: z.ZodArray<z.ZodString>;
    blockedCategories: z.ZodArray<z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>>;
    excludedTerms: z.ZodArray<z.ZodString>;
    requireApproval: z.ZodBoolean;
}, z.core.$strip>;
export type IntentConstraintsT = z.infer<typeof IntentConstraints>;
export declare const IntentStatus: z.ZodEnum<{
    draft: "draft";
    interpreted: "interpreted";
    discovering: "discovering";
    evaluated: "evaluated";
    decided: "decided";
    blocked: "blocked";
    failed: "failed";
}>;
export declare const EngineInfo: z.ZodObject<{
    name: z.ZodEnum<{
        deterministic: "deterministic";
        "llm-assisted": "llm-assisted";
        llm: "llm";
    }>;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    usedLlm: z.ZodBoolean;
    latencyMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type EngineInfoT = z.infer<typeof EngineInfo>;
export declare const Intent: z.ZodObject<{
    id: z.ZodString;
    runId: z.ZodOptional<z.ZodString>;
    rawText: z.ZodString;
    category: z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>;
    constraints: z.ZodObject<{
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
        budgetMax: z.ZodOptional<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>>;
        budgetMin: z.ZodOptional<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>>;
        numeric: z.ZodArray<z.ZodObject<{
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
            value: z.ZodNumber;
            valueMax: z.ZodOptional<z.ZodNumber>;
            unit: z.ZodOptional<z.ZodString>;
            source: z.ZodEnum<{
                default: "default";
                user: "user";
                policy: "policy";
                inferred: "inferred";
            }>;
            weight: z.ZodDefault<z.ZodNumber>;
            hard: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        keywords: z.ZodArray<z.ZodString>;
        preferences: z.ZodArray<z.ZodString>;
        blockedCategories: z.ZodArray<z.ZodEnum<{
            laptop: "laptop";
            desktop: "desktop";
            components: "components";
            monitor: "monitor";
            accessory: "accessory";
            phone: "phone";
            tablet: "tablet";
            audio: "audio";
            other: "other";
        }>>;
        excludedTerms: z.ZodArray<z.ZodString>;
        requireApproval: z.ZodBoolean;
    }, z.core.$strip>;
    budget: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    approvalRequired: z.ZodBoolean;
    createdAt: z.ZodString;
    status: z.ZodEnum<{
        draft: "draft";
        interpreted: "interpreted";
        discovering: "discovering";
        evaluated: "evaluated";
        decided: "decided";
        blocked: "blocked";
        failed: "failed";
    }>;
    engine: z.ZodObject<{
        name: z.ZodEnum<{
            deterministic: "deterministic";
            "llm-assisted": "llm-assisted";
            llm: "llm";
        }>;
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        usedLlm: z.ZodBoolean;
        latencyMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    confidence: z.ZodNumber;
    notes: z.ZodArray<z.ZodString>;
    openQuestions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type IntentT = z.infer<typeof Intent>;
export declare const CreateIntentRequest: z.ZodObject<{
    text: z.ZodString;
    currency: z.ZodOptional<z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>>;
    requireApproval: z.ZodOptional<z.ZodBoolean>;
    policyId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateIntentRequestT = z.infer<typeof CreateIntentRequest>;
export declare const UpdateIntentConstraintsRequest: z.ZodObject<{
    numeric: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        value: z.ZodNumber;
        valueMax: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodString>;
        source: z.ZodEnum<{
            default: "default";
            user: "user";
            policy: "policy";
            inferred: "inferred";
        }>;
        weight: z.ZodDefault<z.ZodNumber>;
        hard: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
    preferences: z.ZodOptional<z.ZodArray<z.ZodString>>;
    budgetMax: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    budgetMin: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    requireApproval: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type UpdateIntentConstraintsRequestT = z.infer<typeof UpdateIntentConstraintsRequest>;
//# sourceMappingURL=intent.d.ts.map