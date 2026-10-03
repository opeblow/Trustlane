/**
 * Minimal, dependency-free PayPal REST client (OAuth2 client-credentials +
 * Orders v2). Only the calls Autopilot actually needs are implemented, and every
 * call is explicit about which environment it talks to.
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  environment: 'sandbox' | 'live';
  timeoutMs?: number;
}

export interface PayPalToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  obtainedAt: number;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links?: PayPalLink[];
  create_time?: string;
  update_time?: string;
  purchase_units?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PayPalCapture {
  id: string;
  status: string;
  status_details?: Record<string, unknown>;
  amount?: PayPalMoney;
  [key: string]: unknown;
}

export interface PayPalCaptureResult {
  id: string;
  status: string;
  capture?: PayPalCapture;
  raw: Record<string, unknown>;
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly name2: string;
  readonly details: unknown;
  readonly debugId: string | undefined;

  constructor(message: string, status: number, name: string, details: unknown, debugId?: string) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status;
    this.name2 = name;
    this.details = details;
    this.debugId = debugId;
  }
}

export class PayPalClient {
  private token: PayPalToken | null = null;

  constructor(private readonly config: PayPalConfig) {}

  get environment(): 'sandbox' | 'live' {
    return this.config.environment;
  }

  get isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  /** Non-mutating connectivity probe: obtains and discards an access token. */
  async verifyCredentials(): Promise<{ ok: true; expiresIn: number }> {
    const token = await this.accessToken();
    return { ok: true, expiresIn: token ? (this.token?.expiresIn ?? 0) : 0 };
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() - this.token.obtainedAt < (this.token.expiresIn - 60) * 1000) {
      return this.token.accessToken;
    }
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await this.request('POST', '/v1/oauth2/token', {
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      authenticated: false,
    });
    const payload = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type?: string;
    };
    this.token = {
      accessToken: payload.access_token,
      expiresIn: payload.expires_in,
      tokenType: payload.token_type ?? 'Bearer',
      obtainedAt: Date.now(),
    };
    return this.token.accessToken;
  }

  async createOrder(input: {
    amount: { value: number; currency: string };
    description: string;
    referenceId: string;
    returnUrl?: string;
    cancelUrl?: string;
    brandName?: string;
  }): Promise<PayPalOrder> {
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.amount.currency,
            value: input.amount.value.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: input.brandName ?? 'Autopilot',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
        ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
      },
    };
    const response = await this.request('POST', '/v2/checkout/orders', { body: payload });
    return (await response.json()) as PayPalOrder;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    const response = await this.request('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return (await response.json()) as PayPalOrder;
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<PayPalCaptureResult> {
    const response = await this.request(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { body: {}, headers: { 'paypal-request-id': idempotencyKey } },
    );
    const raw = (await response.json()) as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      status: String(raw.status ?? 'UNKNOWN'),
      capture: extractCapture(raw),
      raw,
    };
  }

  async authorizeOrder(orderId: string, idempotencyKey: string): Promise<PayPalOrder> {
    const response = await this.request(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
      { body: {}, headers: { 'paypal-request-id': idempotencyKey } },
    );
    return (await response.json()) as PayPalOrder;
  }

  async verifyWebhookSignature(headers: Record<string, string>, body: string): Promise<boolean> {
    // Webhook verification is intentionally out of scope for the local build:
    // Autopilot never relies on inbound webhooks to decide payment truth, it
    // always re-reads the order from PayPal.
    void headers;
    void body;
    return false;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      authenticated?: boolean;
    } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...options.headers,
    };
    if (options.authenticated !== false) {
      headers.authorization = `Bearer ${await this.accessToken()}`;
      if (options.body !== undefined && !headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        let parsed: unknown = text;
        let name = `HTTP_${response.status}`;
        let details: unknown = undefined;
        let debugId: string | undefined = response.headers.get('paypal-debug-id') ?? undefined;
        try {
          const json = JSON.parse(text) as { name?: string; message?: string; debug_id?: string; details?: unknown };
          name = json.name ?? name;
          details = json.details ?? json;
          debugId = json.debug_id ?? debugId;
          parsed = json;
        } catch {
          /* keep raw text */
        }
        throw new PayPalApiError(
          `PayPal ${method} ${path} failed: ${name}`,
          response.status,
          name,
          details ?? parsed,
          debugId,
        );
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function extractCapture(raw: Record<string, unknown>): PayPalCapture | undefined {
  const units = raw.purchase_units as Array<Record<string, unknown>> | undefined;
  for (const unit of units ?? []) {
    const payments = unit.payments as
      | { captures?: PayPalCapture[]; authorizations?: Array<Record<string, unknown>> }
      | undefined;
    const capture = payments?.captures?.[0];
    if (capture) return capture;
    const authorization = payments?.authorizations?.[0] as Record<string, unknown> | undefined;
    if (authorization) {
      return {
        id: String(authorization.id ?? ''),
        status: String(authorization.status ?? 'UNKNOWN'),
        amount: authorization.amount as PayPalMoney | undefined,
        status_details: authorization.status_details as Record<string, unknown> | undefined,
      };
    }
  }
  return undefined;
}

export function approvalUrl(order: PayPalOrder): string | null {
  const link = (order.links ?? []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  return link?.href ?? null;
}

export function isOrderApproved(order: PayPalOrder): boolean {
  return order.status === 'APPROVED' || order.status === 'COMPLETED';
}
