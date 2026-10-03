import { z } from 'zod';
/** ISO-8601 timestamp string. */
export const IsoDateTime = z
    .string()
    .describe('ISO-8601 timestamp (UTC)');
export const Id = z.string().min(1).describe('Opaque resource identifier');
export const CorrelationId = z
    .string()
    .min(8)
    .describe('Correlation id shared by every event of one execution run');
export const Severity = z.enum(['info', 'warn', 'error']).describe('Event severity');
export const ProviderName = z
    .enum([
    'paypal',
    'channel3',
    'elastic',
    'zapier',
    'astropods',
    'kernel',
    'bryntum',
    'ag-grid',
    'apimatic',
    'postman',
    'internal',
    'local-catalog',
])
    .describe('Sponsor or internal provider identifier');
export const ProviderStatus = z.enum([
    'live',
    'configured',
    'unavailable',
    'degraded',
    'simulated',
    'not_applicable',
]);
export const ProviderHealth = z.object({
    provider: ProviderName,
    status: ProviderStatus,
    detail: z.string(),
    checkedAt: IsoDateTime,
    endpoint: z.string().optional(),
    requiresCredentials: z.boolean(),
});
export const ApiError = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        correlationId: CorrelationId.optional(),
        details: z.record(z.string(), z.unknown()).optional(),
    }),
});
//# sourceMappingURL=common.js.map