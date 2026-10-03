import { z } from 'zod';
export declare const RiskFlag: z.ZodObject<{
    code: z.ZodString;
    severity: z.ZodEnum<{
        info: "info";
        warn: "warn";
        block: "block";
    }>;
    message: z.ZodString;
}, z.core.$strip>;
export type RiskFlagT = z.infer<typeof RiskFlag>;
export declare const LineItem: z.ZodObject<{
    productId: z.ZodString;
    title: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodObject<{
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
    total: z.ZodObject<{
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
    merchant: z.ZodString;
}, z.core.$strip>;
export type LineItemT = z.infer<typeof LineItem>;
export declare const PurchasePlanStatus: z.ZodEnum<{
    draft: "draft";
    failed: "failed";
    policy_blocked: "policy_blocked";
    awaiting_approval: "awaiting_approval";
    approved: "approved";
    paypal_order_created: "paypal_order_created";
    payment_pending: "payment_pending";
    paid: "paid";
    verified: "verified";
    cancelled: "cancelled";
    expired: "expired";
    stale: "stale";
}>;
export declare const PurchasePlan: z.ZodObject<{
    id: z.ZodString;
    runId: z.ZodString;
    intentId: z.ZodString;
    product: z.ZodObject<{
        id: z.ZodString;
        provider: z.ZodString;
        externalId: z.ZodString;
        title: z.ZodString;
        brand: z.ZodOptional<z.ZodString>;
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
        price: z.ZodObject<{
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
        listPrice: z.ZodOptional<z.ZodObject<{
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
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
        attributes: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            unit: z.ZodOptional<z.ZodString>;
            numericValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            evidence: z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>>;
        availability: z.ZodObject<{
            status: z.ZodEnum<{
                unknown: "unknown";
                in_stock: "in_stock";
                out_of_stock: "out_of_stock";
                preorder: "preorder";
                backorder: "backorder";
            }>;
            quantity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            observedAt: z.ZodString;
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
        sourceUrl: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodObject<{
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
        retrievedAt: z.ZodString;
        raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    lineItems: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        title: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodObject<{
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
        total: z.ZodObject<{
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
        merchant: z.ZodString;
    }, z.core.$strip>>;
    subtotal: z.ZodObject<{
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
    shipping: z.ZodObject<{
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
    tax: z.ZodObject<{
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
    total: z.ZodObject<{
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
    currency: z.ZodString;
    policyResult: z.ZodObject<{
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
    paypalOrderId: z.ZodNullable<z.ZodString>;
    approvalId: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        draft: "draft";
        failed: "failed";
        policy_blocked: "policy_blocked";
        awaiting_approval: "awaiting_approval";
        approved: "approved";
        paypal_order_created: "paypal_order_created";
        payment_pending: "payment_pending";
        paid: "paid";
        verified: "verified";
        cancelled: "cancelled";
        expired: "expired";
        stale: "stale";
    }>;
    riskFlags: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        severity: z.ZodEnum<{
            info: "info";
            warn: "warn";
            block: "block";
        }>;
        message: z.ZodString;
    }, z.core.$strip>>;
    planHash: z.ZodString;
    quotedAt: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    expiresAt: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type PurchasePlanT = z.infer<typeof PurchasePlan>;
export declare const AuthorizationScope: z.ZodObject<{
    planId: z.ZodString;
    planHash: z.ZodString;
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
    currency: z.ZodString;
    policyId: z.ZodString;
    policyVersion: z.ZodNumber;
    description: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type AuthorizationScopeT = z.infer<typeof AuthorizationScope>;
export declare const ApprovalStatus: z.ZodEnum<{
    approved: "approved";
    expired: "expired";
    pending: "pending";
    denied: "denied";
    revoked: "revoked";
    consumed: "consumed";
}>;
export declare const Approval: z.ZodObject<{
    id: z.ZodString;
    purchasePlanId: z.ZodString;
    runId: z.ZodString;
    authorizationScope: z.ZodObject<{
        planId: z.ZodString;
        planHash: z.ZodString;
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
        currency: z.ZodString;
        policyId: z.ZodString;
        policyVersion: z.ZodNumber;
        description: z.ZodString;
        correlationId: z.ZodString;
    }, z.core.$strip>;
    status: z.ZodEnum<{
        approved: "approved";
        expired: "expired";
        pending: "pending";
        denied: "denied";
        revoked: "revoked";
        consumed: "consumed";
    }>;
    actor: z.ZodString;
    requestedAt: z.ZodString;
    approvedAt: z.ZodNullable<z.ZodString>;
    deniedAt: z.ZodNullable<z.ZodString>;
    expiresAt: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ApprovalT = z.infer<typeof Approval>;
export declare const PaymentStatus: z.ZodEnum<{
    failed: "failed";
    awaiting_approval: "awaiting_approval";
    approved: "approved";
    cancelled: "cancelled";
    created: "created";
    captured: "captured";
    refunded: "refunded";
}>;
export declare const VerificationState: z.ZodEnum<{
    unverified: "unverified";
    failed: "failed";
    verified: "verified";
}>;
export declare const Payment: z.ZodObject<{
    id: z.ZodString;
    purchasePlanId: z.ZodString;
    runId: z.ZodString;
    paypalOrderId: z.ZodString;
    transactionId: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        failed: "failed";
        awaiting_approval: "awaiting_approval";
        approved: "approved";
        cancelled: "cancelled";
        created: "created";
        captured: "captured";
        refunded: "refunded";
    }>;
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
    currency: z.ZodString;
    capturedAt: z.ZodNullable<z.ZodString>;
    verificationState: z.ZodEnum<{
        unverified: "unverified";
        failed: "failed";
        verified: "verified";
    }>;
    provider: z.ZodEnum<{
        paypal: "paypal";
        simulated: "simulated";
    }>;
    mode: z.ZodEnum<{
        live: "live";
        simulated: "simulated";
        sandbox: "sandbox";
    }>;
    attempts: z.ZodNumber;
    lastError: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type PaymentT = z.infer<typeof Payment>;
export declare const PreparePurchaseRequest: z.ZodObject<{
    runId: z.ZodString;
    productId: z.ZodString;
    policyId: z.ZodOptional<z.ZodString>;
    quantity: z.ZodOptional<z.ZodNumber>;
    expectedPlanHash: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PreparePurchaseRequestT = z.infer<typeof PreparePurchaseRequest>;
export declare const ApprovePurchaseRequest: z.ZodObject<{
    actor: z.ZodDefault<z.ZodString>;
    planHash: z.ZodString;
    confirm: z.ZodDefault<z.ZodBoolean>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ApprovePurchaseRequestT = z.infer<typeof ApprovePurchaseRequest>;
export declare const CapturePurchaseRequest: z.ZodObject<{
    actor: z.ZodDefault<z.ZodString>;
    planHash: z.ZodString;
    payerId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CapturePurchaseRequestT = z.infer<typeof CapturePurchaseRequest>;
export declare const PaymentSource: z.ZodObject<{
    provider: z.ZodEnum<{
        paypal: "paypal";
        channel3: "channel3";
        elastic: "elastic";
        zapier: "zapier";
        astropods: "astropods";
        kernel: "kernel";
        bryntum: "bryntum";
        "ag-grid": "ag-grid";
        apimatic: "apimatic";
        postman: "postman";
        internal: "internal";
        "local-catalog": "local-catalog";
    }>;
    mode: z.ZodEnum<{
        live: "live";
        simulated: "simulated";
        sandbox: "sandbox";
    }>;
}, z.core.$strip>;
export type PaymentSourceT = z.infer<typeof PaymentSource>;
//# sourceMappingURL=purchase.d.ts.map