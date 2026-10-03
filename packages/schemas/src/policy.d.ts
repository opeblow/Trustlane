import { z } from 'zod';
export declare const UserPolicy: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    currency: z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>;
    maxTransaction: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    dailyLimit: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    approvalThreshold: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    requireApproval: z.ZodBoolean;
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
    allowedCategories: z.ZodNullable<z.ZodArray<z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>>>;
    blockedMerchants: z.ZodArray<z.ZodString>;
    maxQuoteAgeMinutes: z.ZodNumber;
    emergencyStop: z.ZodBoolean;
    version: z.ZodNumber;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type UserPolicyT = z.infer<typeof UserPolicy>;
export declare const PolicyOutcome: z.ZodEnum<{
    allow: "allow";
    requires_approval: "requires_approval";
    deny: "deny";
}>;
export declare const PolicyRuleResult: z.ZodObject<{
    rule: z.ZodEnum<{
        availability: "availability";
        currency_match: "currency_match";
        max_transaction: "max_transaction";
        daily_limit: "daily_limit";
        approval_threshold: "approval_threshold";
        blocked_category: "blocked_category";
        allowed_category: "allowed_category";
        blocked_merchant: "blocked_merchant";
        quote_freshness: "quote_freshness";
        emergency_stop: "emergency_stop";
        suspicious_amount: "suspicious_amount";
    }>;
    outcome: z.ZodEnum<{
        warn: "warn";
        pass: "pass";
        block: "block";
    }>;
    message: z.ZodString;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type PolicyRuleResultT = z.infer<typeof PolicyRuleResult>;
export declare const PolicyDecision: z.ZodObject<{
    policyId: z.ZodString;
    policyVersion: z.ZodNumber;
    outcome: z.ZodEnum<{
        allow: "allow";
        requires_approval: "requires_approval";
        deny: "deny";
    }>;
    approvalRequired: z.ZodBoolean;
    rules: z.ZodArray<z.ZodObject<{
        rule: z.ZodEnum<{
            availability: "availability";
            currency_match: "currency_match";
            max_transaction: "max_transaction";
            daily_limit: "daily_limit";
            approval_threshold: "approval_threshold";
            blocked_category: "blocked_category";
            allowed_category: "allowed_category";
            blocked_merchant: "blocked_merchant";
            quote_freshness: "quote_freshness";
            emergency_stop: "emergency_stop";
            suspicious_amount: "suspicious_amount";
        }>;
        outcome: z.ZodEnum<{
            warn: "warn";
            pass: "pass";
            block: "block";
        }>;
        message: z.ZodString;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    evaluatedAt: z.ZodString;
    inputHash: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type PolicyDecisionT = z.infer<typeof PolicyDecision>;
export declare const PolicyCheckRequest: z.ZodObject<{
    amount: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
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
    currency: z.ZodOptional<z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>>;
    merchant: z.ZodOptional<z.ZodString>;
    productId: z.ZodOptional<z.ZodString>;
    policyId: z.ZodOptional<z.ZodString>;
    quotedAt: z.ZodOptional<z.ZodString>;
    availability: z.ZodOptional<z.ZodEnum<{
        unknown: "unknown";
        in_stock: "in_stock";
        out_of_stock: "out_of_stock";
        preorder: "preorder";
        backorder: "backorder";
    }>>;
    correlationId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PolicyCheckRequestT = z.infer<typeof PolicyCheckRequest>;
export declare const UpsertPolicyRequest: z.ZodObject<{
    currency: z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>;
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
    requireApproval: z.ZodBoolean;
    name: z.ZodString;
    maxTransaction: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    dailyLimit: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    approvalThreshold: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    allowedCategories: z.ZodNullable<z.ZodArray<z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>>>;
    blockedMerchants: z.ZodArray<z.ZodString>;
    maxQuoteAgeMinutes: z.ZodNumber;
    emergencyStop: z.ZodBoolean;
    id: z.ZodOptional<z.ZodString>;
    expectedVersion: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type UpsertPolicyRequestT = z.infer<typeof UpsertPolicyRequest>;
//# sourceMappingURL=policy.d.ts.map