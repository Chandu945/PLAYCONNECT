/**
 * Integration tests against real Cashfree Sandbox API.
 * Only runs when CASHFREE_CLIENT_ID is set and non-empty.
 *
 * Run: CASHFREE_CLIENT_ID=xxx CASHFREE_CLIENT_SECRET=xxx npx jest --testPathPattern=cashfree-sandbox
 */
import { CashfreeHttpClient } from '../src/infrastructure/payments/cashfree/cashfree-http.client';
import { CashfreeAdapter } from '../src/infrastructure/payments/cashfree/cashfree.adapter';
import type { CashfreeGatewayPort } from '../src/domain/subscription-payments/ports/cashfree-gateway.port';
import type { LoggerPort } from '../src/shared/logging/logger.port';

const SANDBOX_BASE_URL = 'https://sandbox.cashfree.com/pg';
const API_VERSION = '2023-08-01';

const hasCredentials =
  !!process.env.CASHFREE_CLIENT_ID &&
  process.env.CASHFREE_CLIENT_ID !== 'TEST_CASHFREE_APP_ID';

const describeOrSkip = hasCredentials ? describe : describe.skip;

const silentLogger: LoggerPort = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('Cashfree Sandbox Integration', () => {
  describeOrSkip('with sandbox credentials', () => {
    let adapter: CashfreeGatewayPort;
    let generatedOrderId: string;

    beforeAll(() => {
      const httpClient = new CashfreeHttpClient(
        {
          clientId: process.env.CASHFREE_CLIENT_ID!,
          clientSecret: process.env.CASHFREE_CLIENT_SECRET!,
          apiVersion: API_VERSION,
          baseUrl: SANDBOX_BASE_URL,
        },
        silentLogger,
      );
      adapter = new CashfreeAdapter(httpClient, silentLogger);
    });

    it('Create order returns cfOrderId and paymentSessionId', async () => {
      generatedOrderId = `test_int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const result = await adapter.createOrder({
        orderId: generatedOrderId,
        orderAmount: 1.00,
        orderCurrency: 'INR',
        customerId: 'test_customer_1',
        customerPhone: '+919876543210',
        idempotencyKey: generatedOrderId,
      });

      expect(result.cfOrderId).toBeDefined();
      expect(result.cfOrderId.length).toBeGreaterThan(0);
      expect(result.paymentSessionId).toBeDefined();
      expect(result.paymentSessionId.length).toBeGreaterThan(0);
      expect(result.orderExpiryTime).toBeDefined();
    });

    it('Get order returns order status ACTIVE', async () => {
      // Use the order created in the previous test
      expect(generatedOrderId).toBeDefined();

      const result = await adapter.getOrder(generatedOrderId);

      expect(result.orderId).toBe(generatedOrderId);
      expect(result.cfOrderId).toBeDefined();
      expect(result.orderStatus).toBe('ACTIVE');
      expect(result.orderAmount).toBe(1.00);
    });

    it('Create order with same orderId returns same session (idempotent)', async () => {
      // Create first order
      const orderId = `test_idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const result1 = await adapter.createOrder({
        orderId,
        orderAmount: 1.00,
        orderCurrency: 'INR',
        customerId: 'test_customer_1',
        customerPhone: '+919876543210',
        idempotencyKey: orderId,
      });

      // Create with same orderId — Cashfree should return the same session
      const result2 = await adapter.createOrder({
        orderId,
        orderAmount: 1.00,
        orderCurrency: 'INR',
        customerId: 'test_customer_1',
        customerPhone: '+919876543210',
        idempotencyKey: orderId,
      });

      expect(result2.cfOrderId).toBe(result1.cfOrderId);
      expect(result2.paymentSessionId).toBe(result1.paymentSessionId);
    });

    it('Invalid credentials return error', async () => {
      const badClient = new CashfreeHttpClient(
        {
          clientId: 'invalid_client_id',
          clientSecret: 'invalid_secret',
          apiVersion: API_VERSION,
          baseUrl: SANDBOX_BASE_URL,
        },
        silentLogger,
      );
      const badAdapter = new CashfreeAdapter(badClient, silentLogger);

      await expect(
        badAdapter.createOrder({
          orderId: `test_bad_${Date.now()}`,
          orderAmount: 1.00,
          orderCurrency: 'INR',
          customerId: 'test_customer',
          customerPhone: '+919876543210',
          idempotencyKey: `test_bad_${Date.now()}`,
        }),
      ).rejects.toThrow(/Cashfree API error/);
    });

    it('Invalid order amount returns error', async () => {
      await expect(
        adapter.createOrder({
          orderId: `test_bad_amt_${Date.now()}`,
          orderAmount: -100,
          orderCurrency: 'INR',
          customerId: 'test_customer',
          customerPhone: '+919876543210',
          idempotencyKey: `test_bad_amt_${Date.now()}`,
        }),
      ).rejects.toThrow(/Cashfree API error/);
    });
  });

  // Ensure the skip branch is clear
  if (!hasCredentials) {
    it('skips sandbox tests when CASHFREE_CLIENT_ID is not set', () => {
      expect(true).toBe(true);
    });
  }
});
