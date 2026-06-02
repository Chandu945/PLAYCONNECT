import { LogoutAllUseCase } from './logout-all.usecase';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { UserAuthCachePort } from '../../identity/ports/user-auth-cache.port';
import { User } from '@domain/identity/entities/user.entity';

function buildDeps() {
  const sessionRepo = {
    revokeAllByUserIds: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SessionRepository>;

  const deviceTokenRepo = {
    removeByUserIds: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DeviceTokenRepository>;

  const userRepo = {
    findById: jest.fn(),
    incrementTokenVersionByUserId: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<UserRepository>;

  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditRecorderPort>;
  const userAuthCache = {
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidateMany: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<UserAuthCachePort>;

  return { sessionRepo, deviceTokenRepo, userRepo, audit, userAuthCache };
}

function mockUser(): User {
  return User.create({
    id: 'user-1',
    fullName: 'Owner One',
    email: 'owner@example.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
}

describe('LogoutAllUseCase', () => {
  it('revokes all sessions, drops device tokens, bumps tokenVersion and busts the auth cache', async () => {
    const { sessionRepo, deviceTokenRepo, userRepo, audit, userAuthCache } = buildDeps();
    (userRepo.findById as jest.Mock).mockResolvedValue(mockUser());

    const uc = new LogoutAllUseCase(sessionRepo, deviceTokenRepo, userRepo, audit, userAuthCache);
    const result = await uc.execute({ userId: 'user-1' });

    expect(result.ok).toBe(true);
    expect(sessionRepo.revokeAllByUserIds).toHaveBeenCalledWith(['user-1']);
    expect(deviceTokenRepo.removeByUserIds).toHaveBeenCalledWith(['user-1']);
    // Deliberate revocation → reject existing access tokens immediately.
    expect(userRepo.incrementTokenVersionByUserId).toHaveBeenCalledWith('user-1', 0);
    expect(userAuthCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('still succeeds (and revokes sessions) when optional userRepo/cache are absent', async () => {
    const { sessionRepo, deviceTokenRepo } = buildDeps();

    const uc = new LogoutAllUseCase(sessionRepo, deviceTokenRepo);
    const result = await uc.execute({ userId: 'user-1' });

    expect(result.ok).toBe(true);
    expect(sessionRepo.revokeAllByUserIds).toHaveBeenCalledWith(['user-1']);
  });
});
