import { nowIso } from '@autopilot/schemas';
/**
 * Agent execution trace with an optional Astropods export.
 *
 * Astropods does not expose an open, credential-free runtime API that could be
 * called during a hackathon, so the exporter is the honest adapter boundary: the
 * run trace (tool, latency, status, correlation id) is real and lives in the
 * product, and when ASTROPODS_ENDPOINT is provided the same spans are shipped
 * there as OTLP-style JSON.
 */
export class AstropodsTraceExporter {
    config;
    spans = [];
    pending = [];
    lastError = null;
    constructor(config) {
        this.config = config;
    }
    async health() {
        if (!this.config.endpoint) {
            return {
                provider: 'astropods',
                status: 'unconfigured',
                detail: 'ASTROPODS_ENDPOINT is not set. Agent spans are recorded and shown in the run trace (Activity → Run trace); nothing is exported off-box.',
                checkedAt: nowIso(),
                requiresCredentials: true,
            };
        }
        return {
            provider: 'astropods',
            status: 'configured',
            detail: `Spans are exported to ${this.config.endpoint}.`,
            checkedAt: nowIso(),
            endpoint: this.config.endpoint,
            requiresCredentials: true,
        };
    }
    record(span) {
        this.spans.push(span);
        this.pending.push(span);
    }
    recordToolCall(record) {
        const span = {
            id: record.id,
            runId: record.runId,
            correlationId: record.correlationId,
            name: `tool:${record.tool}`,
            startedAt: record.startedAt,
            durationMs: record.durationMs,
            status: record.status === 'ok' ? 'ok' : record.status === 'denied' ? 'denied' : 'error',
            attributes: {
                tool: record.tool,
                status: record.status,
                summary: record.resultSummary ?? record.error ?? '',
            },
        };
        this.record(span);
        return span;
    }
    async flush() {
        if (!this.config.endpoint || this.pending.length === 0) {
            return { exported: 0, ...(this.lastError ? { error: this.lastError } : {}) };
        }
        const batch = this.pending;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
        try {
            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
                },
                body: JSON.stringify({ resourceSpans: batch }),
                signal: controller.signal,
            });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            this.pending = [];
            this.lastError = null;
            return { exported: batch.length };
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            return { exported: 0, error: this.lastError };
        }
        finally {
            clearTimeout(timer);
        }
    }
    spansForRun(runId) {
        return this.spans.filter((span) => span.runId === runId);
    }
}
export function createTraceExporter(config) {
    return new AstropodsTraceExporter(config);
}
//# sourceMappingURL=tracer.js.map