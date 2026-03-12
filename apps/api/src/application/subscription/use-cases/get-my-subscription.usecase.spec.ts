import { GetMySubscriptionUseCase } from './get-my-subscription.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { CreateTrialSubscriptionUseCase } from './create-trial-subscription.usecase';
import type { ClockPort } from '../../common/clock.port';
import { User } from '@domain/identity/entities/user.entity';
import { Academy } from '@domain/academy/entities/academy.entity';
import { Subscription } from '@domain/subscription/entities/subscription.entity';
import { createAuditFields, initSoftDelete, ok } from '@shared/kernel';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2025-06-15T12:00:00Z');

function createUser(overrides?: { academyId?: string | null; role?: string }): User {
  const user = User.create({
    id: 'user-1',
    fullName: 'Test Owner',
    email: 'owner@test.com',
    phoneNumber: '+919876543210',
    role: (overrides?.role as 'OWNER') ?? 'OWNER',
    passwordHash: 'hashed',
  });
  if (overrides?.academyId) {
    return User.reconstitute('user-1', {
      ...user['props'],
      academyId: overrides.academyId,
    });
  }
  return user;
}

function createAcademy(id = 'academy-1', ownerUserId = 'user-1'): Academy {
  return Academy.reconstitute(id, {
    ownerUserId,
    academyName: 'Test Academy',
    address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    loginDisabled: false,
    deactivatedAt: null,
    defaultDueDateDay: null,
    receiptPrefix: null,
    lateFeeEnabled: false,
    gracePeriodDays: 5,
    lateFeeAmountInr: 0,
    lateFeeRepeatIntervalDays: 5,
    audit: createAuditFields(),
    softDelete: initSoftDelete(),
  });
}

function createSubscription(academyId = 'academy-1'): Subscription {
  return Subscription.reconstitute('sub-1', {
    academyId,
    trialStartAt: new Date(NOW.getTime() - 5 * DAY_MS),
    trialEndAt: new Date(NOW.getTime() + 25 * DAY_MS),
    paidStartAt: null,
    paidEndAt: null,
    tierKey: null,
    pendingTierKey: null,
    pendingTierEffectiveAt: null,
    activeStudentCountSnapshot: null,
    manualNotes: null,
    paymentReference: null,
    audit: createAuditFields(),
  });
}

function buildDeps() {
  const userRepo: jest.Mocked<UserRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updateAcademyId: jest.fn(),
    listByAcademyAndRole: jest.fn(),
    incrementTokenVersionByAcademyId: jest.fn(),
    listByAcademyId: jest.fn(),
  };

  const academyRepo: jest.Mocked<AcademyRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByOwnerUserId: jest.fn(),
    findAllIds: jest.fn(),
  };

  const subscriptionRepo: jest.Mocked<SubscriptionRepository> = {
    save: jest.fn(),
    findByAcademyId: jest.fn(),
  };

  const createTrial = {
    execute: jest
      .fn()
      .mockResolvedValue(ok({ subscriptionId: 'sub-1', trialStartAt: '', trialEndAt: '' })),
  } as unknown as CreateTrialSubscriptionUseCase;

  const clock: ClockPort = { now: () => NOW };

  return { userRepo, academyRepo, subscriptionRepo, createTrial, clock };
}

describe('GetMySubscriptionUseCase', () => {
  it('should return subscription summary for user with academyId', async () => {
    const { userRepo, academyRepo, subscriptionRepo, createTrial, clock } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser({ academyId: 'academy-1' }));
    academyRepo.findById.mockResolvedValue(createAcademy());
    subscriptionRepo.findByAcademyId.mockResolvedValue(createSubscription());

    const uc = new GetMySubscriptionUseCase(
      userRepo,
      academyRepo,
      subscriptionRepo,
      createTrial,
      clock,
    );
    const result = await uc.execute('user-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('TRIAL');
      expect(result.value.canAccessApp).toBe(true);
      expect(result.value.daysRemaining).toBe(25);
    }
  });

  it('should fallback to findByOwnerUserId for owners without academyId', async () => {
    const { userRepo, academyRepo, subscriptionRepo, createTrial, clock } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser()); // no academyId
    academyRepo.findById.mockResolvedValue(null);
    academyRepo.findByOwnerUserId.mockResolvedValue(createAcademy());
    subscriptionRepo.findByAcademyId.mockResolvedValue(createSubscription());

    const uc = new GetMySubscriptionUseCase(
      userRepo,
      academyRepo,
      subscriptionRepo,
      createTrial,
      clock,
    );
    const result = await uc.execute('user-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('TRIAL');
    }
  });

  it('should return ACADEMY_SETUP_REQUIRED when no academy', async () => {
    const { userRepo, academyRepo, subscriptionRepo, createTrial, clock } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser());
    academyRepo.findById.mockResolvedValue(null);
    academyRepo.findByOwnerUserId.mockResolvedValue(null);

    const uc = new GetMySubscriptionUseCase(
      userRepo,
      academyRepo,
      subscriptionRepo,
      createTrial,
      clock,
    );
    const result = await uc.execute('user-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should auto-heal missing subscription by creating trial', async () => {
    const { userRepo, academyRepo, subscriptionRepo, createTrial, clock } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser({ academyId: 'academy-1' }));
    academyRepo.findById.mockResolvedValue(createAcademy());
    subscriptionRepo.findByAcademyId
      .mockResolvedValueOnce(null) // first call: no subscription
      .mockResolvedValueOnce(createSubscription()); // after auto-heal

    const uc = new GetMySubscriptionUseCase(
      userRepo,
      academyRepo,
      subscriptionRepo,
      createTrial,
      clock,
    );
    const result = await uc.execute('user-1');

    expect(createTrial.execute).toHaveBeenCalledWith('academy-1');
    expect(result.ok).toBe(true);
  });

  it('should return NOT_FOUND when user does not exist', async () => {
    const { userRepo, academyRepo, subscriptionRepo, createTrial, clock } = buildDeps();
    userRepo.findById.mockResolvedValue(null);

    const uc = new GetMySubscriptionUseCase(
      userRepo,
      academyRepo,
      subscriptionRepo,
      createTrial,
      clock,
    );
    const result = await uc.execute('user-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
