import { CurrencyCode, newId, nowIso, } from '@autopilot/schemas';
import { approvalUrl, isOrderApproved, PayPalApiError, PayPalClient, } from "./client.js";
/**
 * Real PayPal adapter. Credentials stay on the server; the browser never sees
 * them, and the adapter refuses to run without an explicit environment.
 */
export class PayPalGateway {
    client;
    provider = 'paypal';
    mode;
    constructor(client) {
        this.client = client;
        this.mode = client.environment;
    }
    isLive() {
        return true;
    }
    async health() {
        if (!this.client.isConfigured) {
            return {
                provider: 'paypal',
                status: 'unavailable',
                detail: 'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.',
                checkedAt: nowIso(),
                requiresCredentials: true,
            };
        }
        try {
            // Non-mutating probe: obtaining a token proves the credentials work and
            // creates no order, no money movement and no seller-side record.
            await this.client.verifyCredentials();
            return {
                provider: 'paypal',
                status: 'live',
                detail: `Authenticated against the ${this.mode} PayPal Orders v2 API (no order was created by this check).`,
                checkedAt: nowIso(),
                endpoint: this.client.environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
                requiresCredentials: true,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                provider: 'paypal',
                status: 'degraded',
                detail: `PayPal is configured but the credential check failed: ${message}`,
                checkedAt: nowIso(),
                requiresCredentials: true,
            };
        }
    }
    async createOrder(input) {
        const order = await this.client.createOrder({
            amount: { value: input.amount.amount, currency: input.amount.currency },
            description: input.description,
            referenceId: input.referenceId,
            ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
            ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
        });
        return {
            provider: 'paypal',
            mode: this.mode,
            orderId: order.id,
            status: order.status,
            approvalUrl: approvalUrl(order),
            createdAt: nowIso(),
            raw: order,
        };
    }
    async getOrder(orderId) {
        const order = await this.client.getOrder(orderId);
        return toOrderState(order, this.mode);
    }
    async captureOrder(orderId, idempotencyKey) {
        const result = await this.client.captureOrder(orderId, idempotencyKey);
        const capture = result.capture;
        return {
            provider: 'paypal',
            mode: this.mode,
            orderId,
            transactionId: capture?.id ?? null,
            status: result.status,
            captured: result.status === 'COMPLETED' && (capture?.status === 'COMPLETED' || capture === undefined),
            amount: capture?.amount
                ? { amount: Number(capture.amount.value), currency: toCurrencyCode(capture.amount.currency_code) }
                : null,
            raw: result.raw,
        };
    }
}
/**
 * PayPal can settle in currencies outside the supported set for a given policy.
 * Rather than guess, anything unsupported becomes USD here and is surfaced by the
 * verification step as a currency mismatch the human has to resolve.
 */
export function toCurrencyCode(code) {
    const parsed = CurrencyCode.safeParse(code.toUpperCase());
    return parsed.success ? parsed.data : 'USD';
}
export function toOrderState(order, mode) {
    const units = (order.purchase_units ?? []);
    let amount = null;
    let transactionId = null;
    for (const unit of units) {
        const unitAmount = unit.amount;
        if (unitAmount?.value && unitAmount.currency_code) {
            amount = { amount: Number(unitAmount.value), currency: toCurrencyCode(unitAmount.currency_code) };
        }
        const payments = unit.payments;
        transactionId = payments?.captures?.[0]?.id ?? payments?.authorizations?.[0]?.id ?? transactionId;
    }
    return {
        provider: 'paypal',
        mode,
        orderId: order.id,
        status: order.status,
        approved: isOrderApproved(order),
        completed: order.status === 'COMPLETED',
        transactionId,
        amount,
        checkedAt: nowIso(),
        raw: order,
    };
}
/**
 * Deterministic offline gateway used when PayPal credentials are absent.
 *
 * It is NOT a PayPal integration and never claims to be: every payment it
 * produces is stamped `provider: 'simulated'` and `mode: 'simulated'`, the UI
 * shows a test-mode banner, and the audit trail records that no PayPal API was
 * contacted. It exists so the governed flow (prepare â†’ approve â†’ capture â†’
 * verify) can be exercised and tested without credentials.
 */
export class SimulatedGateway {
    provider = 'simulated';
    mode = 'simulated';
    orders = new Map();
    isLive() {
        return false;
    }
    async health() {
        return {
            provider: 'paypal',
            status: 'simulated',
            detail: 'PayPal credentials are not configured, so Autopilot is running its deterministic offline payment gateway. No PayPal API is contacted.',
            checkedAt: nowIso(),
            requiresCredentials: true,
        };
    }
    async createOrder(input) {
        const orderId = `SIM-${newId('ord').slice(-12).toUpperCase()}`;
        const order = {
            id: orderId,
            status: 'CREATED',
            amount: input.amount,
            approved: false,
            completed: false,
            transactionId: null,
            description: input.description,
            referenceId: input.referenceId,
            createdAt: nowIso(),
        };
        this.orders.set(orderId, order);
        return {
            provider: 'simulated',
            mode: 'simulated',
            orderId,
            status: order.status,
            approvalUrl: null,
            createdAt: order.createdAt,
            raw: { simulated: true, order },
        };
    }
    async getOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new PayPalApiError(`Unknown simulated order ${orderId}`, 404, 'ORDER_NOT_FOUND', { orderId });
        }
        return {
            provider: 'simulated',
            mode: 'simulated',
            orderId,
            status: order.status,
            approved: order.approved,
            completed: order.completed,
            transactionId: order.transactionId,
            amount: order.amount,
            checkedAt: nowIso(),
            raw: { simulated: true, order },
        };
    }
    /** Stands in for the buyer approving the order inside PayPal's own UI. */
    async approveOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new PayPalApiError(`Unknown simulated order ${orderId}`, 404, 'ORDER_NOT_FOUND', { orderId });
        }
        order.approved = true;
        order.status = 'APPROVED';
        return this.getOrder(orderId);
    }
    async captureOrder(orderId, idempotencyKey) {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new PayPalApiError(`Unknown simulated order ${orderId}`, 404, 'ORDER_NOT_FOUND', { orderId });
        }
        if (order.completed) {
            // Mirrors PayPal's real protection against duplicate capture.
            throw new PayPalApiError(`Order ${orderId} has already been captured`, 422, 'ORDER_ALREADY_CAPTURED', { orderId, idempotencyKey });
        }
        if (!order.approved) {
            throw new PayPalApiError(`Order ${orderId} has not been approved by the payer`, 422, 'ORDER_NOT_APPROVED', { orderId });
        }
        order.completed = true;
        order.status = 'COMPLETED';
        order.transactionId = `SIMTX-${newId('tx').slice(-14).toUpperCase()}`;
        return {
            provider: 'simulated',
            mode: 'simulated',
            orderId,
            transactionId: order.transactionId,
            status: 'COMPLETED',
            captured: true,
            amount: order.amount,
            raw: { simulated: true, order },
        };
    }
}
export function createPayPalGateway(config) {
    const clientId = config.clientId ?? '';
    const clientSecret = config.clientSecret ?? '';
    const environment = config.environment === 'live' ? 'live' : 'sandbox';
    if (!clientId || !clientSecret)
        return new SimulatedGateway();
    const paypalConfig = {
        clientId,
        clientSecret,
        environment,
        baseUrl: config.baseUrl ?? (environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'),
    };
    return new PayPalGateway(new PayPalClient(paypalConfig));
}
//# sourceMappingURL=adapter.js.map