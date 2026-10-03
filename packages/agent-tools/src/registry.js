import { ToolContractMap, newId, nowIso, } from '@autopilot/schemas';
export class ToolValidationError extends Error {
    issues;
    constructor(tool, issues) {
        super(`Invalid arguments for tool "${tool}": ${issues.join('; ')}`);
        this.name = 'ToolValidationError';
        this.issues = issues;
    }
}
export class ToolDeniedError extends Error {
    constructor(tool, reason) {
        super(`Tool "${tool}" denied: ${reason}`);
        this.name = 'ToolDeniedError';
    }
}
/**
 * Typed tool registry. The model may only *propose* tool calls; every proposal
 * is parsed against its zod contract here, and rejected arguments never reach
 * any handler. Money-affecting tools are additionally gated by the agent's
 * stage — an agent cannot capture a payment before an approval exists.
 */
export class ToolRegistry {
    tools = new Map();
    allowedOwners;
    constructor(handlers, allowedOwners = {}) {
        for (const [name, handler] of Object.entries(handlers)) {
            const toolName = name;
            this.tools.set(toolName, {
                name: toolName,
                owner: inferOwner(toolName),
                description: `Autopilot tool: ${toolName}`,
                execute: async (args, ctx) => {
                    const started = Date.now();
                    const schema = ToolContractMap[toolName];
                    const parsed = schema.safeParse(args ?? {});
                    if (!parsed.success) {
                        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
                        throw new ToolValidationError(toolName, issues);
                    }
                    const fn = handler;
                    const result = await fn.call(undefined, parsed.data, ctx);
                    return { ok: result.summary !== 'error', durationMs: Date.now() - started, ...result };
                },
            });
        }
        this.allowedOwners = allowedOwners;
    }
    list() {
        return [...this.tools.values()];
    }
    has(name) {
        return this.tools.has(name);
    }
    /** Which tools the given agent role is permitted to call. */
    permittedFor(owner) {
        return this.list().filter((tool) => tool.owner === owner && (this.allowedOwners[tool.name]?.includes(owner) ?? true));
    }
    async call(name, args, ctx) {
        const tool = this.tools.get(name);
        if (!tool)
            throw new ToolDeniedError(name, 'tool is not registered');
        return tool.execute(args, ctx);
    }
    /** Returns a ToolCallRecord suitable for the audit trail. */
    async callRecorded(name, args, ctx) {
        const startedAt = nowIso();
        const started = Date.now();
        const record = {
            id: newId('tc'),
            runId: ctx.runId,
            correlationId: ctx.correlationId,
            tool: name,
            arguments: (args ?? {}),
            status: 'ok',
            startedAt,
            durationMs: 0,
            resultSummary: undefined,
            error: null,
        };
        try {
            const result = await this.call(name, args, ctx);
            record.status = result.ok ? 'ok' : 'error';
            record.durationMs = result.durationMs;
            record.resultSummary = result.summary;
            record.error = result.error ?? null;
            return { record, result, error: null };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            record.status = error instanceof ToolDeniedError ? 'denied' : 'error';
            record.durationMs = Date.now() - started;
            record.error = message;
            return { record, result: null, error: message };
        }
    }
}
const OWNER_BY_TOOL = {
    parse_intent: 'intent',
    validate_constraints: 'intent',
    catalog_search: 'discovery',
    product_details: 'discovery',
    compare_products: 'evaluation',
    evidence_lookup: 'evaluation',
    score_candidate: 'decision',
    explain_tradeoffs: 'decision',
    policy_check: 'policy',
    create_paypal_order: 'execution',
    request_approval: 'execution',
    capture_payment: 'execution',
    get_paypal_order: 'verification',
    verify_order: 'verification',
    trigger_automation: 'automation',
    search_events: 'automation',
};
function inferOwner(name) {
    return OWNER_BY_TOOL[name];
}
export { OWNER_BY_TOOL };
//# sourceMappingURL=registry.js.map