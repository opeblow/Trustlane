import { z } from 'zod';
export declare const EventQuery: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodArray<z.ZodString>>;
    severity: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        error: "error";
        info: "info";
        warn: "warn";
    }>>>;
    correlationId: z.ZodOptional<z.ZodString>;
    runId: z.ZodOptional<z.ZodString>;
    since: z.ZodOptional<z.ZodString>;
    until: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type EventQueryT = z.infer<typeof EventQuery>;
export declare const EventSearchResponse: z.ZodObject<{
    total: z.ZodNumber;
    tookMs: z.ZodNumber;
    engine: z.ZodEnum<{
        elastic: "elastic";
        local: "local";
    }>;
    degradedReason: z.ZodOptional<z.ZodString>;
    facets: z.ZodObject<{
        types: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
        severities: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
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
}, z.core.$strip>;
export type EventSearchResponseT = z.infer<typeof EventSearchResponse>;
export declare const EventFacets: z.ZodObject<{
    types: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    severities: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=search.d.ts.map