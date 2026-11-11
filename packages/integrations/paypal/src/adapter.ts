import {
  CurrencyCode,
  newId,
  nowIso,
  type CurrencyCodeT,
  type MoneyT,
  type ProviderHealthT,
} from '@autopilot/schemas';
import {
  approvalUrl,
  isOrderApproved,
  PayPalApiError,
  PayPalClient,
  type PayPalConfig,
  type PayPalOrder,
} from './client.ts';

export type PaymentMode = 'sandbox' | 'live' | 'simulated';

export interface CreateOrderInput {
  amount: MoneyT;
  description: string;
  referenceId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreateOrderResult {
  provider: 'paypal' | 'simulated';
  mode: PaymentMode;
  orderId: string;
  status: string;
  approvalUrl: string | null;
  createdAt: string;
  raw: Record<string, unknown>;
}

export interface CaptureResult {
  provider: 'paypal' | 'simulated';
  mode: PaymentMode;
  orderId: string;
  transactionId: string | null;
  status: string;
  captured: boolean;
  amount: MoneyT | null;
  raw: Record<string, unknown>;
}

export interface OrderState {
  provider: 'paypal' | 'simulated';
  mode: PaymentMode;
  orderId: string;
  status: string;
  approved: boolean;
  completed: boolean;
  transactionId: string | null;
  amount: MoneyT | null;
  /** Where the payer must go to approve the order, while it still needs approval. */
  approvalUrl: string | null;
  checkedAt: string;
  raw: Record<string, unknown>;
}

/** True when the provider refused a capture because the order was already captured. */
export function isAlreadyCaptured(error: unknown): boolean {
  return error instanceof PayPalApiError && error.issue === 'ORDER_ALREADY_CAPTURED';
}

/** True when the payer has not approved the order in PayPal yet. */
export function isPayerApprovalMissing(error: unknown): boolean {
  return (
    error instanceof PayPalApiError &&
    (error.issue === 'ORDER_NOT_APPROVED' || error.issue === 'PAYER_ACTION_REQUIRED')
  );
}

export interface PaymentGateway {
  readonly mode: PaymentMode;
  readonly provider: 'paypal' | 'simulated';
  isLive(): boolean;
  health(): Promise<ProviderHealthT>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  getOrder(orderId: string): Promise<OrderState>;
  /** Simulated gateways only: mark the order as buyer-approved (never on real PayPal). */
  approveOrder?(orderId: string): Promise<OrderState>;
  captureOrder(orderId: string, idempotencyKey: string): Promise<CaptureResult>;
}

/**
 * Real PayPal adapter. Credentials stay on the server; the browser never sees
 * them, and the adapter refuses to run without an explicit environment.
 */
export class PayPalGateway implements PaymentGateway {
  readonly provider = 'paypal' as const;
  readonly mode: PaymentMode;

  constructor(private readonly client: PayPalClient) {
    this.mode = client.environment;
  }

  isLive(): boolean {
    return true;
  }

  async health(): Promise<ProviderHealthT> {
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
    } catch (error) {
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

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
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
      raw: order as unknown as Record<string, unknown>,
    };
  }

  async getOrder(orderId: string): Promise<OrderState> {
    const order = await this.client.getOrder(orderId);
    return toOrderState(order, this.mode);
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<CaptureResult> {
    const result = await this.client.captureOrder(orderId, idempotencyKey);
    const capture = result.capture;
    return {
      provider: 'paypal',
      mode: this.mode,
      orderId,
      transactionId: capture?.id ?? null,
      status: result.status,
      // Money has moved only when the capture itself completed. A COMPLETED
      // order with a PENDING or DECLINED capture is not a successful payment.
      captured: result.status === 'COMPLETED' && capture?.status === 'COMPLETED',
      amount: toMoney(capture?.amount),
      raw: result.raw,
    };
  }
}

/**
 * Lenient mapping kept for display code. Money that feeds verification goes
 * through `toMoney`, which never relabels an unsupported currency.
 */
export function toCurrencyCode(code: string): CurrencyCodeT {
  const parsed = CurrencyCode.safeParse(code.toUpperCase());
  return parsed.success ? parsed.data : 'USD';
}

/**
 * Strict provider-amount parsing. An unsupported currency or unreadable value
 * yields `null`, which verification treats as a mismatch — it must never be
 * coerced into a currency that happens to match the plan.
 */
export function toMoney(input: { value?: string; currency_code?: string } | undefined | null): MoneyT | null {
  if (!input?.value || !input.currency_code) return null;
  const currency = CurrencyCode.safeParse(input.currency_code.toUpperCase());
  const amount = Number(input.value);
  if (!currency.success || !Number.isFinite(amount)) return null;
  return { amount, currency: currency.data };
}

export function toOrderState(order: PayPalOrder, mode: PaymentMode): OrderState {
  const units = (order.purchase_units ?? []) as Array<Record<string, unknown>>;
  let amount: MoneyT | null = null;
  let transactionId: string | null = null;
  let captureStatus: string | null = null;
  for (const unit of units) {
    const unitAmount = unit.amount as { value?: string; currency_code?: string } | undefined;
    amount = toMoney(unitAmount) ?? amount;
    const payments = unit.payments as
      | { captures?: Array<{ id: string; status?: string }>; authorizations?: Array<{ id: string }> }
      | undefined;
    const capture = payments?.captures?.[0];
    if (capture) captureStatus = capture.status ?? captureStatus;
    transactionId = capture?.id ?? payments?.authorizations?.[0]?.id ?? transactionId;
  }
  return {
    provider: 'paypal',
    mode,
    orderId: order.id,
    status: order.status,
    approved: isOrderApproved(order),
    // "Completed" means the money was captured, not merely that the order
    // object reached its final state.
    completed: order.status === 'COMPLETED' && captureStatus === 'COMPLETED',
    transactionId,
    amount,
    approvalUrl: order.status === 'COMPLETED' ? null : approvalUrl(order),
    checkedAt: nowIso(),
    raw: order as unknown as Record<string, unknown>,
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
export class SimulatedGateway implements PaymentGateway {
  readonly provider = 'simulated' as const;
  readonly mode: PaymentMode = 'simulated';

  private readonly orders = new Map<string, SimulatedOrder>();

  /**
   * With a storage backend the simulated orders survive a restart, so a plan
   * prepared before the process was recycled can still be captured and verified.
   */
  constructor(private readonly storage?: SimulatedOrderStorage) {}

  private find(orderId: string): SimulatedOrder | undefined {
    const cached = this.orders.get(orderId);
    if (cached) return cached;
    const stored = this.storage?.load(orderId);
    if (stored) this.orders.set(orderId, stored);
    return stored;
  }

  private persist(order: SimulatedOrder): void {
    this.orders.set(order.id, order);
    this.storage?.save(order);
  }

  isLive(): boolean {
    return false;
  }

  async health(): Promise<ProviderHealthT> {
    return {
      provider: 'paypal',
      status: 'simulated',
      detail:
        'PayPal credentials are not configured, so Autopilot is running its deterministic offline payment gateway. No PayPal API is contacted.',
      checkedAt: nowIso(),
      requiresCredentials: true,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!Number.isFinite(input.amount.amount) || input.amount.amount <= 0) {
      throw new PayPalApiError(
        `Refusing to create an order for a non-positive amount (${input.amount.amount})`,
        400,
        'INVALID_AMOUNT',
        { amount: input.amount },
      );
    }
    const orderId = `SIM-${newId('ord').slice(-12).toUpperCase()}`;
    const order: SimulatedOrder = {
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
    this.persist(order);
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

  async getOrder(orderId: string): Promise<OrderState> {
    const order = this.find(orderId);
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
      approvalUrl: null,
      checkedAt: nowIso(),
      raw: { simulated: true, order },
    };
  }

  /** Stands in for the buyer approving the order inside PayPal's own UI. */
  async approveOrder(orderId: string): Promise<OrderState> {
    const order = this.find(orderId);
    if (!order) {
      throw new PayPalApiError(`Unknown simulated order ${orderId}`, 404, 'ORDER_NOT_FOUND', { orderId });
    }
    if (!order.completed) {
      order.approved = true;
      order.status = 'APPROVED';
      this.persist(order);
    }
    return this.getOrder(orderId);
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<CaptureResult> {
    const order = this.find(orderId);
    if (!order) {
      throw new PayPalApiError(`Unknown simulated order ${orderId}`, 404, 'ORDER_NOT_FOUND', { orderId });
    }
    if (order.completed) {
      // Mirrors PayPal's real protection against duplicate capture.
      throw new PayPalApiError(
        `Order ${orderId} has already been captured`,
        422,
        'ORDER_ALREADY_CAPTURED',
        { orderId, idempotencyKey },
      );
    }
    if (!order.approved) {
      throw new PayPalApiError(
        `Order ${orderId} has not been approved by the payer`,
        422,
        'ORDER_NOT_APPROVED',
        { orderId },
      );
    }
    order.completed = true;
    order.status = 'COMPLETED';
    order.transactionId = `SIMTX-${newId('tx').slice(-14).toUpperCase()}`;
    this.persist(order);
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

export interface SimulatedOrderStorage {
  load(orderId: string): SimulatedOrder | undefined;
  save(order: SimulatedOrder): void;
}

export interface SimulatedOrder {
  id: string;
  status: string;
  amount: MoneyT;
  approved: boolean;
  completed: boolean;
  transactionId: string | null;
  description: string;
  referenceId: string;
  createdAt: string;
}

export function createPayPalGateway(config: {
  clientId?: string;
  clientSecret?: string;
  environment?: 'sandbox' | 'live';
  baseUrl?: string;
  /** Durable storage for the simulated gateway's orders (ignored with real PayPal). */
  simulatedStorage?: SimulatedOrderStorage;
}): PaymentGateway {
  const clientId = config.clientId ?? '';
  const clientSecret = config.clientSecret ?? '';
  const environment = config.environment === 'live' ? 'live' : 'sandbox';
  if (!clientId || !clientSecret) return new SimulatedGateway(config.simulatedStorage);
  const paypalConfig: PayPalConfig = {
    clientId,
    clientSecret,
    environment,
    baseUrl: config.baseUrl ?? (environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'),
  };
  return new PayPalGateway(new PayPalClient(paypalConfig));
}
