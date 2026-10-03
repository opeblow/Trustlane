import { z } from 'zod';
/** ISO-8601 timestamp string. */
export declare const IsoDateTime: z.ZodString;
export declare const Id: z.ZodString;
export declare const CorrelationId: z.ZodString;
export declare const Severity: z.ZodEnum<{
    error: "error";
    info: "info";
    warn: "warn";
}>;
export declare const ProviderName: z.ZodEnum<{
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
export declare const ProviderStatus: z.ZodEnum<{
    live: "live";
    configured: "configured";
    unavailable: "unavailable";
    degraded: "degraded";
    simulated: "simulated";
    not_applicable: "not_applicable";
}>;
export declare const ProviderHealth: z.ZodObject<{
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
    status: z.ZodEnum<{
        live: "live";
        configured: "configured";
        unavailable: "unavailable";
        degraded: "degraded";
        simulated: "simulated";
        not_applicable: "not_applicable";
    }>;
    detail: z.ZodString;
    checkedAt: z.ZodString;
    endpoint: z.ZodOptional<z.ZodString>;
    requiresCredentials: z.ZodBoolean;
}, z.core.$strip>;
export declare const ApiError: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        correlationId: z.ZodOptional<z.ZodString>;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type SeverityT = z.infer<typeof Severity>;
export type ProviderStatusT = z.infer<typeof ProviderStatus>;
export type ProviderHealthT = z.infer<typeof ProviderHealth>;
export type ApiErrorT = z.infer<typeof ApiError>;
//# sourceMappingURL=common.d.ts.map