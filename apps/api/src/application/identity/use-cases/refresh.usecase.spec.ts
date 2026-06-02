import { RefreshUseCase } from './refresh.usecase';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { TokenService } from '../ports/token-service.port';
import { Session } from '@domain/identity/entities/session.entity';
import { User } from '@domain/identity/entities/user.entity';

function createMockSession(overrides?: {
  revokedAt?: Date;
  expiresAt?: Date;
  previousRefreshTokenHash?: string | null;
  previousRefreshTokenExpiresAt?: Date | null;
}): Session {
  return Session.reconstitute('session-1', {
    userId: 'user-1',
    deviceId: 'device-1',
    refreshTokenHash: 'stored-hash',
    createdAt: new Date(),
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 86400000),
    revokedAt: overrides?.revokedAt ?? null,
    lastRotatedAt: null,
    previousRefreshTokenHash: overrides?.previousRefreshTokenHash ?? null,
    previousRefreshTokenExpiresAt: overrides?.previousRefreshTokenExpiresAt ?? null,
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
    deleteExpiredAndRevoked: jest.fn(),
  };

  const userRepo: jest.Mocked<UserRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updateAcademyId: jest.fn(),
    listByAcademyAndRole: jest.fn(),
    countActiveByAcademyAndRole: jest.fn().mockResolvedValue(0),
    incrementTokenVersionByAcademyId: jest.fn(),
    incrementTokenVersionByUserId: jest.fn(),
    listByAcademyId: jest.fn(),
    anonymizeAndSoftDelete: jest.fn(),
    listParentIdsByAcademy: jest.fn().mockResolvedValue([]),
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
  it('should rotate refresh token and return new tokens (carrying a grace window)', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    sessionRepo.updateRefreshToken.mockResolvedValue(true);
    tokenService.compareRefreshToken.mockReturnValue(true);
    userRepo.findById.mockResolvedValue(createMockUser());

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
    // Rotation CAS on the current hash + a grace expiry passed for the old hash.
    expect(sessionRepo.updateRefreshToken).toHaveBeenCalledWith(
      'session-1',
      'new-hash',
      expect.any(Date),
      'stored-hash',
      expect.any(Date),
    );
  });

  it('does NOT bump tokenVersion on routine refresh and re-issues at the same version', async () => {
    // Regression guard for the "Token revoked" thrash: routine refresh must not
    // increment the per-user tokenVersion (which would invalidate other devices'
    // and concurrent requests' still-valid access tokens). The new access token
    // must carry the user's CURRENT tokenVersion unchanged.
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    sessionRepo.updateRefreshToken.mockResolvedValue(true);
    tokenService.compareRefreshToken.mockReturnValue(true);
    userRepo.findById.mockResolvedValue(createMockUser());

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'old-refresh',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    expect(userRepo.incrementTokenVersionByUserId).not.toHaveBeenCalled();
    expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 0 }),
    );
  });

  it('accepts the previous refresh token within the rotation grace window (lost-response retry)', async () => {
    // A dropped rotation response leaves the client holding its prior token.
    // Re-presenting it within the grace window must succeed (NOT be treated as
    // reuse) so the user is not force-logged-out by a network hiccup.
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(
      createMockSession({
        previousRefreshTokenHash: 'prev-hash',
        previousRefreshTokenExpiresAt: new Date(Date.now() + 30_000),
      }),
    );
    sessionRepo.updateRefreshToken.mockResolvedValue(true);
    // Current hash does NOT match; previous hash (within grace) DOES.
    tokenService.compareRefreshToken.mockReturnValueOnce(false).mockReturnValueOnce(true);
    userRepo.findById.mockResolvedValue(createMockUser());

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'previous-refresh',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    expect(sessionRepo.revokeByUserAndDevice).not.toHaveBeenCalled();
    // One-shot grace: a grace-path redemption rotates WITHOUT re-arming the
    // window (5th arg undefined), so the just-redeemed token cannot be replayed
    // and a forked lineage is detected as reuse on the next rotation.
    expect(sessionRepo.updateRefreshToken).toHaveBeenCalledWith(
      'session-1',
      'new-hash',
      expect.any(Date),
      'stored-hash',
      undefined,
    );
  });

  it('revokes when the previous token is presented AFTER the grace window (reuse/theft)', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(
      createMockSession({
        previousRefreshTokenHash: 'prev-hash',
        previousRefreshTokenExpiresAt: new Date(Date.now() - 1_000), // grace expired
      }),
    );
    // Neither current nor (expired) previous is honoured.
    tokenService.compareRefreshToken.mockReturnValue(false);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'previous-refresh',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
    expect(sessionRepo.revokeByUserAndDevice).toHaveBeenCalled();
  });

  it('should fail when session rotation CAS fails (concurrent rotation)', async () => {
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    tokenService.compareRefreshToken.mockReturnValue(true);
    sessionRepo.updateRefreshToken.mockResolvedValue(false); // another request rotated first
    userRepo.findById.mockResolvedValue(createMockUser());

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

  it('M1: rejects refresh for an INACTIVE user (canLogin re-check)', async () => {
    // Pre-fix: refresh.usecase didn't re-check user status, so a user
    // deactivated between login and the next refresh could keep minting
    // access tokens for the lifetime of their refresh token (30d default).
    // Post-fix: canLogin runs on the freshly-loaded user record, returning
    // FORBIDDEN if status flipped to INACTIVE.
    const { sessionRepo, userRepo, tokenService } = buildDeps();
    sessionRepo.findActiveByDeviceId.mockResolvedValue(createMockSession());
    tokenService.compareRefreshToken.mockReturnValue(true);
    sessionRepo.updateRefreshToken.mockResolvedValue(true);

    const inactiveUser = User.reconstitute('user-1', {
      ...createMockUser()['props'],
      status: 'INACTIVE',
    });
    userRepo.findById.mockResolvedValue(inactiveUser);

    const uc = new RefreshUseCase(sessionRepo, userRepo, tokenService);
    const result = await uc.execute({
      refreshToken: 'refresh-token',
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
