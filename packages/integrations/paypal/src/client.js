/**
 * Minimal, dependency-free PayPal REST client (OAuth2 client-credentials +
 * Orders v2). Only the calls Autopilot actually needs are implemented, and every
 * call is explicit about which environment it talks to.
 */
export class PayPalApiError extends Error {
    status;
    name2;
    details;
    debugId;
    constructor(message, status, name, details, debugId) {
        super(message);
        this.name = 'PayPalApiError';
        this.status = status;
        this.name2 = name;
        this.details = details;
        this.debugId = debugId;
    }
}
export class PayPalClient {
    config;
    token = null;
    constructor(config) {
        this.config = config;
    }
    get environment() {
        return this.config.environment;
    }
    get isConfigured() {
        return Boolean(this.config.clientId && this.config.clientSecret);
    }
    /** Non-mutating connectivity probe: obtains and discards an access token. */
    async verifyCredentials() {
        const token = await this.accessToken();
        return { ok: true, expiresIn: token ? (this.token?.expiresIn ?? 0) : 0 };
    }
    async accessToken() {
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
        const payload = (await response.json());
        this.token = {
            accessToken: payload.access_token,
            expiresIn: payload.expires_in,
            tokenType: payload.token_type ?? 'Bearer',
            obtainedAt: Date.now(),
        };
        return this.token.accessToken;
    }
    async createOrder(input) {
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
        return (await response.json());
    }
    async getOrder(orderId) {
        const response = await this.request('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
        return (await response.json());
    }
    async captureOrder(orderId, idempotencyKey) {
        const response = await this.request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { body: {}, headers: { 'paypal-request-id': idempotencyKey } });
        const raw = (await response.json());
        return {
            id: String(raw.id ?? ''),
            status: String(raw.status ?? 'UNKNOWN'),
            capture: extractCapture(raw),
            raw,
        };
    }
    async authorizeOrder(orderId, idempotencyKey) {
        const response = await this.request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, { body: {}, headers: { 'paypal-request-id': idempotencyKey } });
        return (await response.json());
    }
    async verifyWebhookSignature(headers, body) {
        // Webhook verification is intentionally out of scope for the local build:
        // Autopilot never relies on inbound webhooks to decide payment truth, it
        // always re-reads the order from PayPal.
        void headers;
        void body;
        return false;
    }
    async request(method, path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);
        const headers = {
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
                let parsed = text;
                let name = `HTTP_${response.status}`;
                let details = undefined;
                let debugId = response.headers.get('paypal-debug-id') ?? undefined;
                try {
                    const json = JSON.parse(text);
                    name = json.name ?? name;
                    details = json.details ?? json;
                    debugId = json.debug_id ?? debugId;
                    parsed = json;
                }
                catch {
                    /* keep raw text */
                }
                throw new PayPalApiError(`PayPal ${method} ${path} failed: ${name}`, response.status, name, details ?? parsed, debugId);
            }
            return response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
export function extractCapture(raw) {
    const units = raw.purchase_units;
    for (const unit of units ?? []) {
        const payments = unit.payments;
        const capture = payments?.captures?.[0];
        if (capture)
            return capture;
        const authorization = payments?.authorizations?.[0];
        if (authorization) {
            return {
                id: String(authorization.id ?? ''),
                status: String(authorization.status ?? 'UNKNOWN'),
                amount: authorization.amount,
                status_details: authorization.status_details,
            };
        }
    }
    return undefined;
}
export function approvalUrl(order) {
    const link = (order.links ?? []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    return link?.href ?? null;
}
export function isOrderApproved(order) {
    return order.status === 'APPROVED' || order.status === 'COMPLETED';
}
//# sourceMappingURL=client.js.map