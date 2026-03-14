import { HandleCashfreeWebhookUseCase } from './handle-cashfree-webhook.usecase';
import { SubscriptionPayment } from '@domain/subscription-payments/entities/subscription-payment.entity';
import { Subscription } from '@domain/subscription/entities/subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

function freshTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makePendingPayment(orderId = 'pc_sub_20260315_abc') {
  return SubscriptionPayment.create({
    id: 'pay-1',
    academyId: 'academy-1',
    ownerUserId: 'user-1',
    orderId,
    paymentSessionId: 'session_abc',
    tierKey: 'TIER_0_50',
    amountInr: 299,
    activeStudentCountAtPurchase: 30,
  });
}

function makeSubscription() {
  const now = new Date('2026-03-15T12:00:00+05:30');
  return Subscription.createTrial({
    id: 'sub-1',
    academyId: 'academy-1',
    trialStartAt: new Date(now.getTime() - 15 * DAY_MS),
    trialEndAt: new Date(now.getTime() + 15 * DAY_MS),
  });
}

function makeWebhookPayload(orderId: string, status: string, cfPaymentId = '12345') {
  return Buffer.from(JSON.stringify({
    data: {
      order: { order_id: orderId, order_amount: 299 },
      payment: { payment_status: status, cf_payment_id: cfPaymentId },
    },
  }));
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    paymentRepo: {
      findByOrderId: jest.fn().mockResolvedValue(makePendingPayment()),
      save: jest.fn().mockResolvedValue(undefined),
      saveWithStatusPrecondition: jest.fn().mockResolvedValue(true),
    },
    subscriptionRepo: {
      findByAcademyId: jest.fn().mockResolvedValue(makeSubscription()),
      save: jest.fn().mockResolvedValue(undefined),
    },
    signatureVerifier: {
      verify: jest.fn().mockReturnValue(true),
    },
    clock: { now: () => new Date('2026-03-15T12:00:00+05:30') },
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    auditRecorder: {
      record: jest.fn().mockResolvedValue(undefined),
    },
    transaction: {
      run: jest.fn().mockImplementation((fn: () => Promise<void>) => fn()),
    },
    ...overrides,
  };
}

describe('HandleCashfreeWebhookUseCase', () => {
  it('rejects invalid signature', async () => {
    const deps = makeDeps({
      signatureVerifier: { verify: jest.fn().mockReturnValue(false) },
    });
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('order-1', 'SUCCESS'),
      { signature: 'bad', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('handles SUCCESS and activates subscription', async () => {
    const deps = makeDeps();
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'SUCCESS'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    expect(deps.paymentRepo.saveWithStatusPrecondition).toHaveBeenCalledTimes(1);
    expect(deps.subscriptionRepo.save).toHaveBeenCalledTimes(1);

    // Verify payment was marked SUCCESS
    const savedPayment = deps.paymentRepo.saveWithStatusPrecondition.mock.calls[0][0];
    expect(savedPayment.status).toBe('SUCCESS');

    // Verify subscription was activated with TIER_0_50
    const savedSub = deps.subscriptionRepo.save.mock.calls[0][0];
    expect(savedSub.tierKey).toBe('TIER_0_50');
    expect(savedSub.paidStartAt).not.toBeNull();
    expect(savedSub.paidEndAt).not.toBeNull();
  });

  it('handles SUCCESS idempotently (already SUCCESS)', async () => {
    const successPayment = makePendingPayment().markSuccess('cf-123', new Date());
    const deps = makeDeps({
      paymentRepo: {
        findByOrderId: jest.fn().mockResolvedValue(successPayment),
        save: jest.fn(),
      },
    });
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'SUCCESS'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    // Should NOT save again
    expect(deps.paymentRepo.save).not.toHaveBeenCalled();
    expect(deps.subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('handles FAILED webhook', async () => {
    const deps = makeDeps();
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'FAILED'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    expect(deps.paymentRepo.save).toHaveBeenCalledTimes(1);
    const savedPayment = deps.paymentRepo.save.mock.calls[0][0];
    expect(savedPayment.status).toBe('FAILED');
    // Subscription should NOT be modified
    expect(deps.subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('handles USER_DROPPED as FAILED', async () => {
    const deps = makeDeps();
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'USER_DROPPED'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    const savedPayment = deps.paymentRepo.save.mock.calls[0][0];
    expect(savedPayment.status).toBe('FAILED');
  });

  it('acks unknown order without error', async () => {
    const deps = makeDeps({
      paymentRepo: {
        findByOrderId: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      },
    });
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('unknown-order', 'SUCCESS'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    expect(deps.paymentRepo.save).not.toHaveBeenCalled();
  });

  it('rejects stale webhook timestamp (replay detection)', async () => {
    const deps = makeDeps();
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes ago
    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'SUCCESS'),
      { signature: 'valid', timestamp: staleTimestamp },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects webhook with amount mismatch', async () => {
    const deps = makeDeps();
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    // Payment has amountInr=299, webhook sends order_amount=500
    const mismatchPayload = Buffer.from(JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_20260315_abc', order_amount: 500 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: '12345' },
      },
    }));

    const result = await uc.execute(
      mismatchPayload,
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.paymentRepo.save).not.toHaveBeenCalled();
  });

  it('does not overwrite SUCCESS with FAILED', async () => {
    const successPayment = makePendingPayment().markSuccess('cf-123', new Date());
    const deps = makeDeps({
      paymentRepo: {
        findByOrderId: jest.fn().mockResolvedValue(successPayment),
        save: jest.fn(),
      },
    });
    const uc = new HandleCashfreeWebhookUseCase(
      deps.paymentRepo as never,
      deps.subscriptionRepo as never,
      deps.signatureVerifier as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
      deps.transaction as never,
    );

    const result = await uc.execute(
      makeWebhookPayload('pc_sub_20260315_abc', 'FAILED'),
      { signature: 'valid', timestamp: freshTimestamp() },
    );

    expect(result.ok).toBe(true);
    // Should not save — already SUCCESS
    expect(deps.paymentRepo.save).not.toHaveBeenCalled();
  });
});
