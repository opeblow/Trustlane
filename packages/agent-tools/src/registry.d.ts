import { z } from 'zod';
import { ToolContractMap, type ToolCallRecordT, type ToolNameT } from '@autopilot/schemas';
export interface ToolContext {
    runId: string;
    correlationId: string;
    signal?: AbortSignal;
}
export interface ToolDefinition<Name extends ToolNameT = ToolNameT> {
    name: Name;
    /** Which agent role may invoke this tool. */
    owner: 'intent' | 'discovery' | 'evaluation' | 'decision' | 'policy' | 'execution' | 'verification' | 'automation';
    description: string;
    /** Validate + execute. Arguments are parsed before the handler ever sees them. */
    execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}
export interface ToolResult {
    ok: boolean;
    data?: unknown;
    error?: string;
    durationMs: number;
    /** One-line summary stored in the audit trail. */
    summary: string;
}
export type ToolHandlers = {
    [Name in ToolNameT]: (args: z.infer<(typeof ToolContractMap)[Name]>, ctx: ToolContext) => Promise<Omit<ToolResult, 'ok' | 'durationMs'>> | Omit<ToolResult, 'ok' | 'durationMs'>;
};
export declare class ToolValidationError extends Error {
    readonly issues: string[];
    constructor(tool: string, issues: string[]);
}
export declare class ToolDeniedError extends Error {
    constructor(tool: string, reason: string);
}
/**
 * Typed tool registry. The model may only *propose* tool calls; every proposal
 * is parsed against its zod contract here, and rejected arguments never reach
 * any handler. Money-affecting tools are additionally gated by the agent's
 * stage — an agent cannot capture a payment before an approval exists.
 */
export declare class ToolRegistry {
    private readonly tools;
    private readonly allowedOwners;
    constructor(handlers: Partial<ToolHandlers>, allowedOwners?: Partial<Record<ToolNameT, string[]>>);
    list(): ToolDefinition[];
    has(name: ToolNameT): boolean;
    /** Which tools the given agent role is permitted to call. */
    permittedFor(owner: string): ToolDefinition[];
    call(name: ToolNameT, args: unknown, ctx: ToolContext): Promise<ToolResult>;
    /** Returns a ToolCallRecord suitable for the audit trail. */
    callRecorded(name: ToolNameT, args: unknown, ctx: ToolContext): Promise<{
        record: ToolCallRecordT;
        result: ToolResult | null;
        error: string | null;
    }>;
}
declare const OWNER_BY_TOOL: Record<ToolNameT, ToolDefinition['owner']>;
export { OWNER_BY_TOOL };
//# sourceMappingURL=registry.d.ts.map