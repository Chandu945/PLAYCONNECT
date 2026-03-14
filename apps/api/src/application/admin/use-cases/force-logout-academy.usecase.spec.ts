import { ForceLogoutAcademyUseCase } from './force-logout-academy.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { Academy } from '@domain/academy/entities/academy.entity';
import { createAuditFields, initSoftDelete } from '@shared/kernel';

function buildDeps() {
  const userRepo: jest.Mocked<UserRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updateAcademyId: jest.fn(),
    listByAcademyAndRole: jest.fn(),
    incrementTokenVersionByAcademyId: jest.fn(),
    incrementTokenVersionByUserId: jest.fn(),
    listByAcademyId: jest.fn(),
  };

  const sessionRepo: jest.Mocked<SessionRepository> = {
    save: jest.fn(),
    findByUserAndDevice: jest.fn(),
    findActiveByDeviceId: jest.fn(),
    revokeByUserAndDevice: jest.fn(),
    updateRefreshToken: jest.fn(),
    revokeAllByUserIds: jest.fn(),
  };

  const academyRepo: jest.Mocked<AcademyRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByOwnerUserId: jest.fn(),
    findAllIds: jest.fn(),
  };

  return { userRepo, sessionRepo, academyRepo };
}

function createAcademy(id = 'academy-1'): Academy {
  return Academy.reconstitute(id, {
    ownerUserId: 'owner-1',
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

describe('ForceLogoutAcademyUseCase', () => {
  it('should increment token versions and revoke all sessions', async () => {
    const { userRepo, sessionRepo, academyRepo } = buildDeps();
    academyRepo.findById.mockResolvedValue(createAcademy());
    userRepo.incrementTokenVersionByAcademyId.mockResolvedValue(['user-1', 'user-2']);
    sessionRepo.revokeAllByUserIds.mockResolvedValue(undefined);

    const uc = new ForceLogoutAcademyUseCase(userRepo, sessionRepo, academyRepo);
    const result = await uc.execute({
      actorRole: 'SUPER_ADMIN',
      academyId: 'academy-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.affectedUsers).toBe(2);
    }
    expect(userRepo.incrementTokenVersionByAcademyId).toHaveBeenCalledWith('academy-1');
    expect(sessionRepo.revokeAllByUserIds).toHaveBeenCalledWith(['user-1', 'user-2']);
  });

  it('should reject non-SUPER_ADMIN', async () => {
    const { userRepo, sessionRepo, academyRepo } = buildDeps();
    const uc = new ForceLogoutAcademyUseCase(userRepo, sessionRepo, academyRepo);
    const result = await uc.execute({
      actorRole: 'OWNER',
      academyId: 'academy-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should return NOT_FOUND if academy does not exist', async () => {
    const { userRepo, sessionRepo, academyRepo } = buildDeps();
    academyRepo.findById.mockResolvedValue(null);

    const uc = new ForceLogoutAcademyUseCase(userRepo, sessionRepo, academyRepo);
    const result = await uc.execute({
      actorRole: 'SUPER_ADMIN',
      academyId: 'missing',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should not call revokeAllByUserIds if no users affected', async () => {
    const { userRepo, sessionRepo, academyRepo } = buildDeps();
    academyRepo.findById.mockResolvedValue(createAcademy());
    userRepo.incrementTokenVersionByAcademyId.mockResolvedValue([]);

    const uc = new ForceLogoutAcademyUseCase(userRepo, sessionRepo, academyRepo);
    const result = await uc.execute({
      actorRole: 'SUPER_ADMIN',
      academyId: 'academy-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.affectedUsers).toBe(0);
    }
    expect(sessionRepo.revokeAllByUserIds).not.toHaveBeenCalled();
  });
});
