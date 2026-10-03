import { type CurrencyCodeT, type MoneyT, type ProviderHealthT } from '@autopilot/schemas';
import { PayPalClient, type PayPalOrder } from './client.ts';
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
    checkedAt: string;
    raw: Record<string, unknown>;
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
export declare class PayPalGateway implements PaymentGateway {
    private readonly client;
    readonly provider: "paypal";
    readonly mode: PaymentMode;
    constructor(client: PayPalClient);
    isLive(): boolean;
    health(): Promise<ProviderHealthT>;
    createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
    getOrder(orderId: string): Promise<OrderState>;
    captureOrder(orderId: string, idempotencyKey: string): Promise<CaptureResult>;
}
/**
 * PayPal can settle in currencies outside the supported set for a given policy.
 * Rather than guess, anything unsupported becomes USD here and is surfaced by the
 * verification step as a currency mismatch the human has to resolve.
 */
export declare function toCurrencyCode(code: string): CurrencyCodeT;
export declare function toOrderState(order: PayPalOrder, mode: PaymentMode): OrderState;
/**
 * Deterministic offline gateway used when PayPal credentials are absent.
 *
 * It is NOT a PayPal integration and never claims to be: every payment it
 * produces is stamped `provider: 'simulated'` and `mode: 'simulated'`, the UI
 * shows a test-mode banner, and the audit trail records that no PayPal API was
 * contacted. It exists so the governed flow (prepare â†’ approve â†’ capture â†’
 * verify) can be exercised and tested without credentials.
 */
export declare class SimulatedGateway implements PaymentGateway {
    readonly provider: "simulated";
    readonly mode: PaymentMode;
    private readonly orders;
    isLive(): boolean;
    health(): Promise<ProviderHealthT>;
    createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
    getOrder(orderId: string): Promise<OrderState>;
    /** Stands in for the buyer approving the order inside PayPal's own UI. */
    approveOrder(orderId: string): Promise<OrderState>;
    captureOrder(orderId: string, idempotencyKey: string): Promise<CaptureResult>;
}
export declare function createPayPalGateway(config: {
    clientId?: string;
    clientSecret?: string;
    environment?: 'sandbox' | 'live';
    baseUrl?: string;
}): PaymentGateway;
//# sourceMappingURL=adapter.d.ts.map