import { z } from 'zod';
import { Severity } from './common.ts';
import { AuditEvent } from './events.ts';

export const EventQuery = z.object({
  /** Free-text search across type, actor, source, payload keys and values. */
  q: z.string().max(200).optional(),
  type: z.array(z.string()).optional(),
  severity: z.array(Severity).optional(),
  correlationId: z.string().optional(),
  runId: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type EventQueryT = z.infer<typeof EventQuery>;

export const EventSearchResponse = z.object({
  total: z.number().int(),
  tookMs: z.number(),
  /** Which index answered: 'elastic' or 'local'. */
  engine: z.enum(['elastic', 'local']),
  /** Set when Elastic is configured but unreachable — results come from the local index. */
  degradedReason: z.string().optional(),
  facets: z.object({
    types: z.array(z.object({ key: z.string(), count: z.number().int() })),
    severities: z.array(z.object({ key: z.string(), count: z.number().int() })),
  }),
  events: z.array(AuditEvent),
});
export type EventSearchResponseT = z.infer<typeof EventSearchResponse>;

export const EventFacets = EventSearchResponse.shape.facets;