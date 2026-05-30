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
      // M1 fix (subscription audit): failure paths now go through CAS save.
      saveWithStatusPrecondition: jest.fn().mockResolvedValue(true),
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
      countEligibleStudents: jest.fn().mockResolvedValue(30),
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
      expect(result.value.amountInr).toBe(299); // peak 30 → TIER_0_50
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

  it('resumes a recent PENDING payment instead of creating a new Cashfree order', async () => {
    // Clock is 2026-03-15T12:00:00+05:30. PENDING created 2 min earlier is well
    // within the 5-min resume window, so initiate should hand back the SAME
    // orderId+paymentSessionId and never call Cashfree.
    const recentPending = {
      orderId: 'pc_sub_existing_xyz',
      paymentSessionId: 'session_existing_abc',
      cfOrderId: 'cf_existing_123',
      amountInr: 299,
      currency: 'INR',
      tierKey: 'TIER_0_50',
      audit: { createdAt: new Date('2026-03-15T11:58:00+05:30') },
    };
    const deps = makeDeps({
      paymentRepo: {
        findPendingByAcademyId: jest.fn().mockResolvedValue(recentPending),
        save: jest.fn(),
        saveWithStatusPrecondition: jest.fn(),
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
      expect(result.value.orderId).toBe('pc_sub_existing_xyz');
      expect(result.value.paymentSessionId).toBe('session_existing_abc');
    }
    expect(deps.cashfreeGateway.createOrder).not.toHaveBeenCalled();
    expect(deps.paymentRepo.save).not.toHaveBeenCalled();
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
        countEligibleStudents: jest.fn().mockResolvedValue(75),
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

  it('bills on the cycle peak, not the current count (peaked at 120, now 40 -> TIER_101_PLUS)', async () => {
    const now = new Date('2026-03-15T12:00:00+05:30');
    const sub = Subscription.createTrial({
      id: 'sub-1',
      academyId: 'academy-1',
      trialStartAt: new Date(now.getTime() - 15 * DAY_MS),
      trialEndAt: new Date(now.getTime() + 15 * DAY_MS),
    }).withTierEvaluation({
      pendingTierKey: null,
      pendingTierEffectiveAt: null,
      activeStudentCountSnapshot: 120,
      peakStudentCountThisCycle: 120, // peaked at 120 this cycle
    });

    const deps = makeDeps({
      subscriptionRepo: { findByAcademyId: jest.fn().mockResolvedValue(sub) },
      studentCounter: {
        // Roster has since dropped to 40 active/eligible.
        countActiveStudents: jest.fn().mockResolvedValue(40),
        countEligibleStudents: jest.fn().mockResolvedValue(40),
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
      // Peak 120 -> TIER_101_PLUS -> ₹699, NOT the current 40 -> ₹299.
      expect(result.value.tierKey).toBe('TIER_101_PLUS');
      expect(result.value.amountInr).toBe(699);
    }
  });
});
