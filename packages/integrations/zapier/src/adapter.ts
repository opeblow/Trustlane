import { nowIso, type ProviderHealthT } from '@autopilot/schemas';

export interface AutomationPayload {
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  runId: string | null;
  purchasePlanId: string | null;
  /** Only ever sent after the payment was independently verified. */
  verified: boolean;
  payment: {
    provider: string;
    mode: string;
    paypalOrderId: string;
    transactionId: string | null;
    amount: { amount: number; currency: string };
    status: string;
    capturedAt: string | null;
  } | null;
  product: { id: string; title: string; merchant: string } | null;
  policy: { policyId: string; policyVersion: number; outcome: string } | null;
}

export interface AutomationDeliveryResult {
  status: 'sent' | 'failed' | 'unconfigured';
  hook: string;
  responseSummary: string;
  durationMs: number;
  httpStatus?: number;
}

export interface AutomationAdapter {
  health(): Promise<ProviderHealthT>;
  deliver(payload: AutomationPayload): Promise<AutomationDeliveryResult>;
  /** Optional dry-run used by POST /api/automations/test. */
  test(payload?: Partial<AutomationPayload>): Promise<AutomationDeliveryResult>;
}

/**
 * Zapier "Catch Hook" adapter. Post-purchase workflows fire from here, and only
 * ever after the payment has been independently verified by the backend.
 */
export class ZapierWebhookAdapter implements AutomationAdapter {
  constructor(
    private readonly config: { hookUrl?: string; timeoutMs?: number },
  ) {}

  async health(): Promise<ProviderHealthT> {
    if (!this.config.hookUrl) {
      return {
        provider: 'zapier',
        status: 'unconfigured',
        detail:
          'ZAPIER_HOOK_URL is not set. Verified purchases are still recorded; the automation is marked unconfigured and retryable, never silently dropped.',
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

  async deliver(payload: AutomationPayload): Promise<AutomationDeliveryResult> {
    if (!this.config.hookUrl) {
      return {
        status: 'unconfigured',
        hook: '(not configured)',
        responseSummary:
          'No ZAPIER_HOOK_URL configured. The purchase remains verified; this automation is pending and can be retried once a hook is provided.',
        durationMs: 0,
      };
    }
    if (!payload.verified) {
      return {
        status: 'failed',
        hook: redactHook(this.config.hookUrl),
        responseSummary:
          'Refused to fire: automations only run on verified payment state, and this event was not verified.',
        durationMs: 0,
      };
    }
    return this.post(payload);
  }

  async test(payload?: Partial<AutomationPayload>): Promise<AutomationDeliveryResult> {
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

  private async post(payload: AutomationPayload): Promise<AutomationDeliveryResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    try {
      const response = await fetch(this.config.hookUrl!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'autopilot', schemaVersion: 1 }),
        signal: controller.signal,
      });
      const text = await response.text().catch(() => '');
      return {
        status: response.ok ? 'sent' : 'failed',
        hook: redactHook(this.config.hookUrl!),
        responseSummary: response.ok
          ? `Accepted by Zapier (HTTP ${response.status})${text ? `: ${text.slice(0, 120)}` : ''}`
          : `Zapier rejected the payload (HTTP ${response.status}): ${text.slice(0, 160)}`,
        durationMs: Date.now() - started,
        httpStatus: response.status,
      };
    } catch (error) {
      return {
        status: 'failed',
        hook: redactHook(this.config.hookUrl!),
        responseSummary: `Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function redactHook(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/[^/]+$/, '***')}`;
  } catch {
    return 'configured';
  }
}

export function createAutomationAdapter(config: { hookUrl?: string; timeoutMs?: number }): AutomationAdapter {
  return new ZapierWebhookAdapter(config);
}