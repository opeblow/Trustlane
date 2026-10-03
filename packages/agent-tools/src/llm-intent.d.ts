import type { IntentT } from '@autopilot/schemas';
import { type LlmConfig } from './llm.ts';
import { type ParsedIntent } from './intent-parser.ts';
export type LlmEnrichmentResult = {
    parsed: ParsedIntent;
    usedLlm: boolean;
    model?: string;
    latencyMs?: number;
    fallbackReason?: string;
};
/**
 * Optionally enrich a deterministically parsed intent with an LLM.
 *
 * Trust boundary: the LLM may only touch classification and soft preferences.
 * Budget, currency, numeric constraints and approval requirements always come
 * from the deterministic parser, and the merged result is validated again by
 * zod. If the call fails or returns malformed output, the deterministic result
 * is used unchanged and the fallback reason is surfaced in the audit trail.
 */
export declare function parseIntent(text: string, options?: {
    config?: LlmConfig | null;
    defaultCurrency?: ParsedIntent['currency'];
    requireApprovalOverride?: boolean;
}): Promise<{
    parsed: ParsedIntent;
    usedLlm: boolean;
    model?: string;
    latencyMs?: number;
    fallbackReason?: string;
}>;
export declare function assertIntentInvariants(intent: IntentT): void;
//# sourceMappingURL=llm-intent.d.ts.map