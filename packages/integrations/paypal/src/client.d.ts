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
export declare class PayPalApiError extends Error {
    readonly status: number;
    readonly name2: string;
    readonly details: unknown;
    readonly debugId: string | undefined;
    constructor(message: string, status: number, name: string, details: unknown, debugId?: string);
}
export declare class PayPalClient {
    private readonly config;
    private token;
    constructor(config: PayPalConfig);
    get environment(): 'sandbox' | 'live';
    get isConfigured(): boolean;
    /** Non-mutating connectivity probe: obtains and discards an access token. */
    verifyCredentials(): Promise<{
        ok: true;
        expiresIn: number;
    }>;
    private accessToken;
    createOrder(input: {
        amount: {
            value: number;
            currency: string;
        };
        description: string;
        referenceId: string;
        returnUrl?: string;
        cancelUrl?: string;
        brandName?: string;
    }): Promise<PayPalOrder>;
    getOrder(orderId: string): Promise<PayPalOrder>;
    captureOrder(orderId: string, idempotencyKey: string): Promise<PayPalCaptureResult>;
    authorizeOrder(orderId: string, idempotencyKey: string): Promise<PayPalOrder>;
    verifyWebhookSignature(headers: Record<string, string>, body: string): Promise<boolean>;
    private request;
}
export declare function extractCapture(raw: Record<string, unknown>): PayPalCapture | undefined;
export declare function approvalUrl(order: PayPalOrder): string | null;
export declare function isOrderApproved(order: PayPalOrder): boolean;
//# sourceMappingURL=client.d.ts.map