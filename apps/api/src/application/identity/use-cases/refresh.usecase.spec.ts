import { RefreshUseCase } from './refresh.usecase';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { TokenService } from '../ports/token-service.port';
import { Session } from '@domain/identity/entities/session.entity';
import { User } from '@domain/identity/entities/user.entity';

function createMockSession(overrides?: { revokedAt?: Date; expiresAt?: Date }): Session {
  return Session.reconstitute('session-1', {
    userId: 'user-1',
    deviceId: 'device-1',
    refreshTokenHash: 'stored-hash',
    createdAt: new Date(),
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 86400000),
    revokedAt: overrides?.revokedAt ?? null,
    lastRotatedAt: null,
  });
}

function createMockUser(): User {
  return User.create({
    id: 'user-1',
    fullName: 'Test User',
    email: 'test@example.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
}

function buildDeps() {
  const sessionRepo: jest.Mocked<SessionRepository> = {
    save: jest.fn(),
    findByUserAndDevice: jest.fn(),
    findActiveByDeviceId: jest.fn(),
    revokeByUserAndDevice: jest.fn(),
    updateRefreshToken: jest.fn(),
    revokeAllByUserIds: jest.fn(),
  };

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

  const tokenService: jest.Mocked<TokenService> = {
    generateAccessToken: jest.fn().mockReturnValue('new-access'),
    generateRefreshToken: jest.fn().mockReturnValue('new-refresh'),
    verifyAccessToken: jest.fn(),
    hashRefreshToken: jest.fn().mockReturnValue('new-hash'),
    compareRefreshToken: jest.fn(),
  };

  return { sessionRepo, userRepo, tokenService };
}

describe('RefreshUseCase', () => {
  it('should rotate refresh token and return new tokens', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    sessionRepo.updateRefreshToken.mockResolvedValue(true);
    tokenService.compareRefreshToken.mockReturnValue(true);
    userRepo.findById.mockResolvedValue(createMockUser());
    userRepo.incrementTokenVersionByUserId.mockResolvedValue(true);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'old-refresh',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe('new-access');
      expect(result.value.refreshToken).toBe('new-refresh');
    }
    expect(sessionRepo.updateRefreshToken).toHaveBeenCalledWith(
      'session-1',
      'new-hash',
      expect.any(Date),
      'stored-hash',
    );
    expect(userRepo.incrementTokenVersionByUserId).toHaveBeenCalledWith(
      expect.any(String),
      0,
    );
  });

  it('should fail when tokenVersion CAS fails (race condition)', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    sessionRepo.updateRefreshToken.mockResolvedValue(true);
    tokenService.compareRefreshToken.mockReturnValue(true);
    userRepo.findById.mockResolvedValue(createMockUser());
    userRepo.incrementTokenVersionByUserId.mockResolvedValue(false);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'old-refresh',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should fail with invalid refresh token', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    tokenService.compareRefreshToken.mockReturnValue(false);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'wrong-token',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
    // Should revoke the session on token reuse
    expect(sessionRepo.revokeByUserAndDevice).toHaveBeenCalled();
  });

  it('should fail when session not found', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(null);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'refresh-token',
      deviceId: 'unknown-device',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should fail when session is expired', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    const expiredSession = createMockSession({
      expiresAt: new Date(Date.now() - 1000),
    });
    sessionRepo.findActiveByDeviceId.mockResolvedValue(expiredSession);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'refresh-token',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
  });

  it('should fail when session is revoked', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    const revokedSession = createMockSession({ revokedAt: new Date() });
    sessionRepo.findActiveByDeviceId.mockResolvedValue(revokedSession);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'refresh-token',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
  });
});
