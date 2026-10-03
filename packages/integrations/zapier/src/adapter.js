import { nowIso } from '@autopilot/schemas';
/**
 * Zapier "Catch Hook" adapter. Post-purchase workflows fire from here, and only
 * ever after the payment has been independently verified by the backend.
 */
export class ZapierWebhookAdapter {
    config;
    constructor(config) {
        this.config = config;
    }
    async health() {
        if (!this.config.hookUrl) {
            return {
                provider: 'zapier',
                status: 'unconfigured',
                detail: 'ZAPIER_HOOK_URL is not set. Verified purchases are still recorded; the automation is marked unconfigured and retryable, never silently dropped.',
                checkedAt: nowIso(),
                requiresCredentials: true,
            };
        }
        return {
            provider: 'zapier',
            status: 'configured',
            detail: `Zapier catch hook is configured (${redactHook(this.config.hookUrl)}).`,
            checkedAt: nowIso(),
            endpoint: redactHook(this.config.hookUrl),
            requiresCredentials: true,
        };
    }
    async deliver(payload) {
        if (!this.config.hookUrl) {
            return {
                status: 'unconfigured',
                hook: '(not configured)',
                responseSummary: 'No ZAPIER_HOOK_URL configured. The purchase remains verified; this automation is pending and can be retried once a hook is provided.',
                durationMs: 0,
            };
        }
        if (!payload.verified) {
            return {
                status: 'failed',
                hook: redactHook(this.config.hookUrl),
                responseSummary: 'Refused to fire: automations only run on verified payment state, and this event was not verified.',
                durationMs: 0,
            };
        }
        return this.post(payload);
    }
    async test(payload) {
        return this.post({
            eventId: 'test_event',
            eventType: 'automation.test',
            occurredAt: nowIso(),
            correlationId: 'test_correlation',
            runId: null,
            purchasePlanId: null,
            verified: true,
            payment: null,
            product: null,
            policy: null,
            ...payload,
        });
    }
    async post(payload) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
        try {
            const response = await fetch(this.config.hookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...payload, source: 'autopilot', schemaVersion: 1 }),
                signal: controller.signal,
            });
            const text = await response.text().catch(() => '');
            return {
                status: response.ok ? 'sent' : 'failed',
                hook: redactHook(this.config.hookUrl),
                responseSummary: response.ok
                    ? `Accepted by Zapier (HTTP ${response.status})${text ? `: ${text.slice(0, 120)}` : ''}`
                    : `Zapier rejected the payload (HTTP ${response.status}): ${text.slice(0, 160)}`,
                durationMs: Date.now() - started,
                httpStatus: response.status,
            };
        }
        catch (error) {
            return {
                status: 'failed',
                hook: redactHook(this.config.hookUrl),
                responseSummary: `Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`,
                durationMs: Date.now() - started,
            };
        }
        finally {
            clearTimeout(timer);
        }
    }
}
export function redactHook(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname.replace(/[^/]+$/, '***')}`;
    }
    catch {
        return 'configured';
    }
}
export function createAutomationAdapter(config) {
    return new ZapierWebhookAdapter(config);
}
//# sourceMappingURL=adapter.js.map