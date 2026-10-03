import { z } from 'zod';
import type { EngineInfoT } from '@autopilot/schemas';
export type LlmProvider = 'openai' | 'anthropic' | 'gemini';
export interface LlmConfig {
    provider: LlmProvider;
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function loadLlmConfig(env?: NodeJS.ProcessEnv): LlmConfig | null;
export declare class LlmError extends Error {
    readonly detail: string;
    constructor(message: string, detail?: string);
}
/**
 * Strict structured completion. The model is asked for JSON matching a schema
 * and its answer is validated with zod before it is allowed anywhere near
 * product state. Any failure raises `LlmError`; callers fall back to the
 * deterministic path and record that in the audit trail.
 */
export declare function completeJson<T>(config: LlmConfig, schema: z.ZodType<T>, args: {
    system: string;
    user: string;
    maxTokens?: number;
}): Promise<{
    data: T;
    model: string;
    latencyMs: number;
    raw: unknown;
}>;
export declare function engineInfo(input: {
    usedLlm: boolean;
    model?: string;
    provider?: string;
    latencyMs?: number;
    fallbackReason?: string;
}): EngineInfoT;
//# sourceMappingURL=llm.d.ts.map