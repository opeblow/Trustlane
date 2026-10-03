import { z } from 'zod';
import {
  ToolContractMap,
  newId,
  nowIso,
  type ToolCallRecordT,
  type ToolNameT,
} from '@autopilot/schemas';

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
  [Name in ToolNameT]: (
    args: z.infer<(typeof ToolContractMap)[Name]>,
    ctx: ToolContext,
  ) => Promise<Omit<ToolResult, 'ok' | 'durationMs'>> | Omit<ToolResult, 'ok' | 'durationMs'>;
};

export class ToolValidationError extends Error {
  readonly issues: string[];
  constructor(tool: string, issues: string[]) {
    super(`Invalid arguments for tool "${tool}": ${issues.join('; ')}`);
    this.name = 'ToolValidationError';
    this.issues = issues;
  }
}

export class ToolDeniedError extends Error {
  constructor(tool: string, reason: string) {
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
  private readonly tools = new Map<ToolNameT, ToolDefinition>();
  private readonly allowedOwners: Partial<Record<ToolNameT, string[]>>;

  constructor(handlers: Partial<ToolHandlers>, allowedOwners: Partial<Record<ToolNameT, string[]>> = {}) {
    for (const [name, handler] of Object.entries(handlers)) {
      const toolName = name as ToolNameT;
      this.tools.set(toolName, {
        name: toolName,
        owner: inferOwner(toolName),
        description: `Autopilot tool: ${toolName}`,
        execute: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
          const started = Date.now();
          const schema = ToolContractMap[toolName];
          const parsed = schema.safeParse(args ?? {});
          if (!parsed.success) {
            const issues = parsed.error.issues.map(
              (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
            );
            throw new ToolValidationError(toolName, issues);
          }
          const fn = handler as (a: unknown, c: ToolContext) => Promise<Omit<ToolResult, 'ok' | 'durationMs'>> | Omit<ToolResult, 'ok' | 'durationMs'>;
          const result = await fn.call(undefined, parsed.data, ctx);
          return { ok: result.summary !== 'error', durationMs: Date.now() - started, ...result };
        },
      });
    }
    this.allowedOwners = allowedOwners;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  has(name: ToolNameT): boolean {
    return this.tools.has(name);
  }

  /** Which tools the given agent role is permitted to call. */
  permittedFor(owner: string): ToolDefinition[] {
    return this.list().filter(
      (tool) => tool.owner === owner && (this.allowedOwners[tool.name]?.includes(owner) ?? true),
    );
  }

  async call(name: ToolNameT, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolDeniedError(name, 'tool is not registered');
    return tool.execute(args, ctx);
  }

  /** Returns a ToolCallRecord suitable for the audit trail. */
  async callRecorded(
    name: ToolNameT,
    args: unknown,
    ctx: ToolContext,
  ): Promise<{ record: ToolCallRecordT; result: ToolResult | null; error: string | null }> {
    const startedAt = nowIso();
    const started = Date.now();
    const record: ToolCallRecordT = {
      id: newId('tc'),
      runId: ctx.runId,
      correlationId: ctx.correlationId,
      tool: name,
      arguments: (args ?? {}) as Record<string, unknown>,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record.status = error instanceof ToolDeniedError ? 'denied' : 'error';
      record.durationMs = Date.now() - started;
      record.error = message;
      return { record, result: null, error: message };
    }
  }
}

const OWNER_BY_TOOL: Record<ToolNameT, ToolDefinition['owner']> = {
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

function inferOwner(name: ToolNameT): ToolDefinition['owner'] {
  return OWNER_BY_TOOL[name];
}

export { OWNER_BY_TOOL };