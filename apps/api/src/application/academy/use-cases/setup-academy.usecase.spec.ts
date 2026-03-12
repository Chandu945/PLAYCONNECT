import { SetupAcademyUseCase } from './setup-academy.usecase';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { CreateTrialSubscriptionUseCase } from '../../subscription/use-cases/create-trial-subscription.usecase';
import { Academy } from '@domain/academy/entities/academy.entity';
import { createAuditFields, initSoftDelete, ok } from '@shared/kernel';

const ADDRESS = {
  line1: '123 Main St',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500001',
  country: 'India',
};

function buildDeps() {
  const academyRepo: jest.Mocked<AcademyRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByOwnerUserId: jest.fn(),
    findAllIds: jest.fn(),
  };
  const userRepo: jest.Mocked<Pick<UserRepository, 'updateAcademyId'>> = {
    updateAcademyId: jest.fn(),
  };
  const createTrial = {
    execute: jest
      .fn()
      .mockResolvedValue(ok({ subscriptionId: 'sub-1', trialStartAt: '', trialEndAt: '' })),
  } as unknown as CreateTrialSubscriptionUseCase;
  return { academyRepo, userRepo: userRepo as unknown as UserRepository, createTrial };
}

describe('SetupAcademyUseCase', () => {
  it('should create academy for owner', async () => {
    const { academyRepo, userRepo, createTrial } = buildDeps();
    academyRepo.findByOwnerUserId.mockResolvedValue(null);

    const uc = new SetupAcademyUseCase(academyRepo, userRepo, createTrial);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      academyName: 'Sunrise Academy',
      address: ADDRESS,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.academyName).toBe('Sunrise Academy');
      expect(result.value.address.city).toBe('Hyderabad');
    }
    expect(academyRepo.save).toHaveBeenCalled();
  });

  it('should reject non-owner role', async () => {
    const { academyRepo, userRepo, createTrial } = buildDeps();

    const uc = new SetupAcademyUseCase(academyRepo, userRepo, createTrial);
    const result = await uc.execute({
      ownerUserId: 'staff-1',
      ownerRole: 'STAFF',
      academyName: 'Test Academy',
      address: ADDRESS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject duplicate academy setup', async () => {
    const { academyRepo, userRepo, createTrial } = buildDeps();
    const existingAcademy = Academy.reconstitute('academy-1', {
      ownerUserId: 'owner-1',
      academyName: 'Existing Academy',
      address: ADDRESS,
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
    academyRepo.findByOwnerUserId.mockResolvedValue(existingAcademy);

    const uc = new SetupAcademyUseCase(academyRepo, userRepo, createTrial);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      academyName: 'Another Academy',
      address: ADDRESS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });
});
