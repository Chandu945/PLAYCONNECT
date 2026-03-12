import { InitiateSubscriptionPaymentUseCase } from './initiate-subscription-payment.usecase';
import { Subscription } from '@domain/subscription/entities/subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeUser(overrides = {}) {
  return {
    id: { toString: () => 'user-1' },
    role: 'OWNER',
    academyId: 'academy-1',
    phoneE164: '+919876543210',
    ...overrides,
  };
}

function makeAcademy(overrides = {}) {
  return {
    id: { toString: () => 'academy-1' },
    ownerUserId: 'user-1',
    loginDisabled: false,
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-03-15T12:00:00+05:30');
  const trialEnd = new Date(now.getTime() + 15 * DAY_MS);

  const sub = Subscription.createTrial({
    id: 'sub-1',
    academyId: 'academy-1',
    trialStartAt: new Date(now.getTime() - 15 * DAY_MS),
    trialEndAt: trialEnd,
  });

  return {
    userRepo: {
      findById: jest.fn().mockResolvedValue(makeUser()),
    },
    academyRepo: {
      findById: jest.fn().mockResolvedValue(makeAcademy()),
      findByOwnerUserId: jest.fn().mockResolvedValue(null),
    },
    subscriptionRepo: {
      findByAcademyId: jest.fn().mockResolvedValue(sub),
    },
    paymentRepo: {
      findPendingByAcademyId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    },
    cashfreeGateway: {
      createOrder: jest.fn().mockResolvedValue({
        cfOrderId: 'cf_123',
        paymentSessionId: 'session_abc',
        orderExpiryTime: '2026-03-15T13:00:00Z',
      }),
    },
    studentCounter: {
      countActiveStudents: jest.fn().mockResolvedValue(30),
    },
    clock: { now: () => now },
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    auditRecorder: {
      record: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('InitiateSubscriptionPaymentUseCase', () => {
  it('creates payment and returns orderId + paymentSessionId', async () => {
    const deps = makeDeps();
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.paymentSessionId).toBe('session_abc');
      expect(result.value.amountInr).toBe(299); // 30 students → TIER_0_50
      expect(result.value.tierKey).toBe('TIER_0_50');
      expect(result.value.currency).toBe('INR');
    }

    expect(deps.cashfreeGateway.createOrder).toHaveBeenCalledTimes(1);
    expect(deps.paymentRepo.save).toHaveBeenCalledTimes(2); // once before Cashfree API, once after success
  });

  it('rejects non-OWNER users', async () => {
    const deps = makeDeps({
      userRepo: {
        findById: jest.fn().mockResolvedValue(makeUser({ role: 'STAFF' })),
      },
    });
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects if disabled academy', async () => {
    const deps = makeDeps({
      academyRepo: {
        findById: jest.fn().mockResolvedValue(makeAcademy({ loginDisabled: true })),
        findByOwnerUserId: jest.fn().mockResolvedValue(null),
      },
    });
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects if PENDING payment already exists', async () => {
    const deps = makeDeps({
      paymentRepo: {
        findPendingByAcademyId: jest.fn().mockResolvedValue({ orderId: 'old-order', audit: { createdAt: new Date('2026-03-15T11:50:00+05:30') } }),
        save: jest.fn(),
      },
    });
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('returns error when Cashfree API fails', async () => {
    const deps = makeDeps({
      cashfreeGateway: {
        createOrder: jest.fn().mockRejectedValue(new Error('Cashfree down')),
      },
    });
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
  });

  it('computes correct tier for 75 students', async () => {
    const deps = makeDeps({
      studentCounter: {
        countActiveStudents: jest.fn().mockResolvedValue(75),
      },
    });
    const uc = new InitiateSubscriptionPaymentUseCase(
      deps.userRepo as never,
      deps.academyRepo as never,
      deps.subscriptionRepo as never,
      deps.paymentRepo as never,
      deps.cashfreeGateway as never,
      deps.studentCounter as never,
      deps.clock,
      deps.logger as never,
      deps.auditRecorder as never,
    );

    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tierKey).toBe('TIER_51_100');
      expect(result.value.amountInr).toBe(499);
    }
  });
});
