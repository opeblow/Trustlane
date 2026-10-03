import { describe, expect, it, vi } from 'vitest';
import { createPayPalGateway, PayPalApiError, PayPalClient, SimulatedGateway } from './index.ts';

describe('PayPal adapter selection', () => {
  it('uses the simulated gateway when credentials are missing', () => {
    const gateway = createPayPalGateway({});
    expect(gateway.provider).toBe('simulated');
    expect(gateway.mode).toBe('simulated');
  });

  it('uses the real PayPal gateway when credentials are present', () => {
    const gateway = createPayPalGateway({ clientId: 'id', clientSecret: 'secret', environment: 'sandbox' });
    expect(gateway.provider).toBe('paypal');
    expect(gateway.mode).toBe('sandbox');
  });
});

describe('PayPal REST client', () => {
  it('authenticates, creates, reads and captures an order', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses: Record<string, unknown> = {
      'https://api-m.sandbox.paypal.com/v1/oauth2/token': {
        access_token: 'token-123',
        expires_in: 32400,
        token_type: 'Bearer',
      },
      'https://api-m.sandbox.paypal.com/v2/checkout/orders': {
        id: 'ORDER-1',
        status: 'CREATED',
        links: [{ href: 'https://paypal.test/approve', rel: 'approve', method: 'GET' }],
      },
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1': {
        id: 'ORDER-1',
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: { value: '10.00', currency_code: 'USD' },
            payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED' }] },
          },
        ],
      },
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1/capture': {
        id: 'ORDER-1',
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: { value: '10.00', currency_code: 'USD' },
            payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED' }] },
          },
        ],
      },
    };

    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const body = responses[url];
      if (!body) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), {
        status: url.endsWith('/token') ? 200 : 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new PayPalClient({
      clientId: 'id',
      clientSecret: 'secret',
      baseUrl: 'https://api-m.sandbox.paypal.com',
      environment: 'sandbox',
    });

    const created = await client.createOrder({
      amount: { value: 10, currency: 'USD' },
      description: 'Autopilot test',
      referenceId: 'plan_1',
    });
    expect(created.id).toBe('ORDER-1');
    expect(created.status).toBe('CREATED');

    const capture = await client.captureOrder('ORDER-1', 'idem-1');
    expect(capture.status).toBe('COMPLETED');
    expect(capture.capture?.id).toBe('CAP-1');

    // Token must be fetched once and reused.
    const tokenCalls = calls.filter((c) => c.url.endsWith('/token'));
    expect(tokenCalls).toHaveLength(1);
    expect((tokenCalls[0]?.init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
  });

  it('surfaces PayPal error names and debug ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ name: 'ORDER_ALREADY_CAPTURED', message: 'already captured', debug_id: 'dbg-1' }),
          { status: 422, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const client = new PayPalClient({
      clientId: 'id',
      clientSecret: 'secret',
      baseUrl: 'https://api-m.sandbox.paypal.com',
      environment: 'sandbox',
    });

    await expect(client.captureOrder('ORDER-1', 'idem-1')).rejects.toBeInstanceOf(PayPalApiError);
    try {
      await client.captureOrder('ORDER-1', 'idem-1');
    } catch (error) {
      expect((error as PayPalApiError).name2).toBe('ORDER_ALREADY_CAPTURED');
      expect((error as PayPalApiError).debugId).toBe('dbg-1');
    }
  });
});

describe('simulated gateway', () => {
  it('enforces approve → capture and refuses duplicate capture', async () => {
    const gateway = new SimulatedGateway();

    const created = await gateway.createOrder({
      amount: { amount: 42, currency: 'USD' },
      description: 'test',
      referenceId: 'plan_x',
    });
    expect(created.status).toBe('CREATED');

    await expect(gateway.captureOrder(created.orderId, 'k1')).rejects.toThrow(/not been approved/);

    const approved = await gateway.approveOrder(created.orderId);
    expect(approved.approved).toBe(true);

    const captured = await gateway.captureOrder(created.orderId, 'k1');
    expect(captured.captured).toBe(true);
    expect(captured.transactionId).toMatch(/^SIMTX-/);

    await expect(gateway.captureOrder(created.orderId, 'k2')).rejects.toThrow(/already been captured/);
  });
});