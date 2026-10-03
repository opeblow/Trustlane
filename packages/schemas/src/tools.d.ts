import { z } from 'zod';
/**
 * Typed tool contracts. Every agent tool call is validated against one of these
 * schemas *before* it reaches the backend — the model can only ever propose
 * structured arguments, never raw HTTP or payment credentials.
 */
export declare const ParseIntentInput: z.ZodObject<{
    text: z.ZodString;
    currency: z.ZodOptional<z.ZodString>;
    policyApprovalDefault: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type ParseIntentInputT = z.infer<typeof ParseIntentInput>;
export declare const ValidateConstraintsInput: z.ZodObject<{
    intentId: z.ZodOptional<z.ZodString>;
    constraints: z.ZodObject<{
        currency: z.ZodString;
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
        budgetMax: z.ZodOptional<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ValidateConstraintsInputT = z.infer<typeof ValidateConstraintsInput>;
export declare const CatalogSearchInput: z.ZodObject<{
    query: z.ZodString;
    category: z.ZodOptional<z.ZodEnum<{
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
    currency: z.ZodOptional<z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>>;
    maxPrice: z.ZodOptional<z.ZodNumber>;
    minPrice: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    includeOutOfStock: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CatalogSearchInputT = z.infer<typeof CatalogSearchInput>;
export declare const ProductDetailsInput: z.ZodObject<{
    productId: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProductDetailsInputT = z.infer<typeof ProductDetailsInput>;
export declare const CompareProductsInput: z.ZodObject<{
    intentId: z.ZodString;
    productIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type CompareProductsInputT = z.infer<typeof CompareProductsInput>;
export declare const EvidenceLookupInput: z.ZodObject<{
    productId: z.ZodString;
    fields: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type EvidenceLookupInputT = z.infer<typeof EvidenceLookupInput>;
export declare const ScoreCandidateInput: z.ZodObject<{
    intentId: z.ZodString;
    productId: z.ZodString;
}, z.core.$strip>;
export type ScoreCandidateInputT = z.infer<typeof ScoreCandidateInput>;
export declare const ExplainTradeoffsInput: z.ZodObject<{
    intentId: z.ZodString;
    productIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ExplainTradeoffsInputT = z.infer<typeof ExplainTradeoffsInput>;
export declare const PolicyCheckInput: z.ZodObject<{
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
export type PolicyCheckInputT = z.infer<typeof PolicyCheckInput>;
export declare const CreatePayPalOrderInput: z.ZodObject<{
    purchasePlanId: z.ZodString;
    correlationId: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreatePayPalOrderInputT = z.infer<typeof CreatePayPalOrderInput>;
export declare const RequestApprovalInput: z.ZodObject<{
    purchasePlanId: z.ZodString;
    planHash: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type RequestApprovalInputT = z.infer<typeof RequestApprovalInput>;
export declare const CapturePaymentInput: z.ZodObject<{
    purchasePlanId: z.ZodString;
    approvalId: z.ZodString;
    planHash: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type CapturePaymentInputT = z.infer<typeof CapturePaymentInput>;
export declare const GetPayPalOrderInput: z.ZodObject<{
    paypalOrderId: z.ZodString;
}, z.core.$strip>;
export type GetPayPalOrderInputT = z.infer<typeof GetPayPalOrderInput>;
export declare const VerifyOrderInput: z.ZodObject<{
    purchasePlanId: z.ZodString;
    correlationId: z.ZodString;
}, z.core.$strip>;
export type VerifyOrderInputT = z.infer<typeof VerifyOrderInput>;
export declare const TriggerAutomationInput: z.ZodObject<{
    purchasePlanId: z.ZodString;
    triggerEventId: z.ZodString;
}, z.core.$strip>;
export type TriggerAutomationInputT = z.infer<typeof TriggerAutomationInput>;
export declare const SearchEventsInput: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    types: z.ZodOptional<z.ZodArray<z.ZodString>>;
    severity: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        error: "error";
        info: "info";
        warn: "warn";
    }>>>;
    correlationId: z.ZodOptional<z.ZodString>;
    runId: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type SearchEventsInputT = z.infer<typeof SearchEventsInput>;
export declare const ToolResultEnvelope: z.ZodObject<{
    tool: z.ZodString;
    ok: z.ZodBoolean;
    durationMs: z.ZodNumber;
    data: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ToolResultEnvelopeT = z.infer<typeof ToolResultEnvelope>;
export declare const ToolContractMap: {
    readonly parse_intent: z.ZodObject<{
        text: z.ZodString;
        currency: z.ZodOptional<z.ZodString>;
        policyApprovalDefault: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    readonly validate_constraints: z.ZodObject<{
        intentId: z.ZodOptional<z.ZodString>;
        constraints: z.ZodObject<{
            currency: z.ZodString;
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
            budgetMax: z.ZodOptional<z.ZodObject<{
                amount: z.ZodNumber;
                currency: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    readonly catalog_search: z.ZodObject<{
        query: z.ZodString;
        category: z.ZodOptional<z.ZodEnum<{
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
        currency: z.ZodOptional<z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>>;
        maxPrice: z.ZodOptional<z.ZodNumber>;
        minPrice: z.ZodOptional<z.ZodNumber>;
        limit: z.ZodOptional<z.ZodNumber>;
        includeOutOfStock: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    readonly product_details: z.ZodObject<{
        productId: z.ZodString;
        provider: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly compare_products: z.ZodObject<{
        intentId: z.ZodString;
        productIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readonly evidence_lookup: z.ZodObject<{
        productId: z.ZodString;
        fields: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readonly score_candidate: z.ZodObject<{
        intentId: z.ZodString;
        productId: z.ZodString;
    }, z.core.$strip>;
    readonly explain_tradeoffs: z.ZodObject<{
        intentId: z.ZodString;
        productIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readonly policy_check: z.ZodObject<{
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
    readonly create_paypal_order: z.ZodObject<{
        purchasePlanId: z.ZodString;
        correlationId: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly request_approval: z.ZodObject<{
        purchasePlanId: z.ZodString;
        planHash: z.ZodString;
        correlationId: z.ZodString;
    }, z.core.$strip>;
    readonly capture_payment: z.ZodObject<{
        purchasePlanId: z.ZodString;
        approvalId: z.ZodString;
        planHash: z.ZodString;
        correlationId: z.ZodString;
    }, z.core.$strip>;
    readonly get_paypal_order: z.ZodObject<{
        paypalOrderId: z.ZodString;
    }, z.core.$strip>;
    readonly verify_order: z.ZodObject<{
        purchasePlanId: z.ZodString;
        correlationId: z.ZodString;
    }, z.core.$strip>;
    readonly trigger_automation: z.ZodObject<{
        purchasePlanId: z.ZodString;
        triggerEventId: z.ZodString;
    }, z.core.$strip>;
    readonly search_events: z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        types: z.ZodOptional<z.ZodArray<z.ZodString>>;
        severity: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            error: "error";
            info: "info";
            warn: "warn";
        }>>>;
        correlationId: z.ZodOptional<z.ZodString>;
        runId: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
};
export type ToolContractMapT = typeof ToolContractMap;
export type ToolNameKey = keyof ToolContractMapT;
export declare const SnapshotResponse: z.ZodObject<{
    run: z.ZodObject<{
        id: z.ZodString;
        intentId: z.ZodString;
        correlationId: z.ZodString;
        stage: z.ZodEnum<{
            policy: "policy";
            intent: "intent";
            discover: "discover";
            evaluate: "evaluate";
            decide: "decide";
            prepare: "prepare";
            approve: "approve";
            pay: "pay";
            verify: "verify";
            automate: "automate";
            audit: "audit";
            done: "done";
        }>;
        status: z.ZodEnum<{
            blocked: "blocked";
            failed: "failed";
            awaiting_approval: "awaiting_approval";
            cancelled: "cancelled";
            queued: "queued";
            running: "running";
            completed: "completed";
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
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        progress: z.ZodNumber;
        progressLabel: z.ZodString;
        candidateCount: z.ZodNumber;
        shortlistedProductIds: z.ZodArray<z.ZodString>;
        planId: z.ZodNullable<z.ZodString>;
        policyId: z.ZodNullable<z.ZodString>;
        blockedReason: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    intent: z.ZodOptional<z.ZodUnknown>;
    products: z.ZodArray<z.ZodUnknown>;
    evaluations: z.ZodArray<z.ZodUnknown>;
    shortlist: z.ZodNullable<z.ZodUnknown>;
    plan: z.ZodNullable<z.ZodUnknown>;
    approval: z.ZodNullable<z.ZodUnknown>;
    payment: z.ZodNullable<z.ZodUnknown>;
    automations: z.ZodArray<z.ZodUnknown>;
    events: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        correlationId: z.ZodString;
        runId: z.ZodNullable<z.ZodString>;
        type: z.ZodEnum<{
            "run.created": "run.created";
            "run.stage.changed": "run.stage.changed";
            "run.failed": "run.failed";
            "run.cancelled": "run.cancelled";
            "intent.created": "intent.created";
            "intent.updated": "intent.updated";
            "catalog.search.started": "catalog.search.started";
            "catalog.search.completed": "catalog.search.completed";
            "product.retrieved": "product.retrieved";
            "product.evaluated": "product.evaluated";
            "shortlist.created": "shortlist.created";
            "evidence.gap.detected": "evidence.gap.detected";
            "policy.checked": "policy.checked";
            "policy.updated": "policy.updated";
            "plan.created": "plan.created";
            "plan.invalidated": "plan.invalidated";
            "approval.requested": "approval.requested";
            "approval.granted": "approval.granted";
            "approval.denied": "approval.denied";
            "approval.expired": "approval.expired";
            "paypal.order.created": "paypal.order.created";
            "paypal.approval.completed": "paypal.approval.completed";
            "payment.captured": "payment.captured";
            "payment.failed": "payment.failed";
            "order.verified": "order.verified";
            "automation.triggered": "automation.triggered";
            "automation.failed": "automation.failed";
            "action.failed": "action.failed";
            "tool.called": "tool.called";
            "system.health": "system.health";
        }>;
        actor: z.ZodString;
        source: z.ZodString;
        payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        timestamp: z.ZodString;
        severity: z.ZodEnum<{
            error: "error";
            info: "info";
            warn: "warn";
        }>;
        sequence: z.ZodNumber;
    }, z.core.$strip>>;
    toolCalls: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        runId: z.ZodString;
        correlationId: z.ZodString;
        tool: z.ZodEnum<{
            parse_intent: "parse_intent";
            validate_constraints: "validate_constraints";
            catalog_search: "catalog_search";
            product_details: "product_details";
            compare_products: "compare_products";
            evidence_lookup: "evidence_lookup";
            score_candidate: "score_candidate";
            explain_tradeoffs: "explain_tradeoffs";
            policy_check: "policy_check";
            create_paypal_order: "create_paypal_order";
            request_approval: "request_approval";
            capture_payment: "capture_payment";
            get_paypal_order: "get_paypal_order";
            verify_order: "verify_order";
            trigger_automation: "trigger_automation";
            search_events: "search_events";
        }>;
        arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        status: z.ZodEnum<{
            error: "error";
            denied: "denied";
            ok: "ok";
        }>;
        startedAt: z.ZodString;
        durationMs: z.ZodNumber;
        resultSummary: z.ZodOptional<z.ZodString>;
        error: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=tools.d.ts.map