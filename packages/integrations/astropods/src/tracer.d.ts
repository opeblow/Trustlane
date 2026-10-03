import { type ProviderHealthT, type ToolCallRecordT } from '@autopilot/schemas';
export interface AgentSpan {
    id: string;
    runId: string;
    correlationId: string;
    name: string;
    startedAt: string;
    durationMs: number;
    status: 'ok' | 'error' | 'denied';
    attributes: Record<string, string | number | boolean>;
}
export interface TraceExporter {
    health(): Promise<ProviderHealthT>;
    /** Always records locally so the run trace is inspectable in the product. */
    record(span: AgentSpan): void;
    /** Best-effort remote export; failures never block the run. */
    flush(): Promise<{
        exported: number;
        error?: string;
    }>;
    spansForRun(runId: string): AgentSpan[];
}
/**
 * Agent execution trace with an optional Astropods export.
 *
 * Astropods does not expose an open, credential-free runtime API that could be
 * called during a hackathon, so the exporter is the honest adapter boundary: the
 * run trace (tool, latency, status, correlation id) is real and lives in the
 * product, and when ASTROPODS_ENDPOINT is provided the same spans are shipped
 * there as OTLP-style JSON.
 */
export declare class AstropodsTraceExporter implements TraceExporter {
    private readonly config;
    private readonly spans;
    private pending;
    private lastError;
    constructor(config: {
        endpoint?: string;
        apiKey?: string;
        timeoutMs?: number;
    });
    health(): Promise<ProviderHealthT>;
    record(span: AgentSpan): void;
    recordToolCall(record: ToolCallRecordT): AgentSpan;
    flush(): Promise<{
        exported: number;
        error?: string;
    }>;
    spansForRun(runId: string): AgentSpan[];
}
export declare function createTraceExporter(config: {
    endpoint?: string;
    apiKey?: string;
    timeoutMs?: number;
}): TraceExporter;
//# sourceMappingURL=tracer.d.ts.map