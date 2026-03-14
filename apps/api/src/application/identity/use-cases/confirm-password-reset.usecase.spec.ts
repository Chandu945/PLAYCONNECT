import { ConfirmPasswordResetUseCase } from './confirm-password-reset.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordResetChallengeRepository } from '@domain/identity/ports/password-reset-challenge.repository';
import type { OtpHasher } from '../ports/otp-hasher.port';
import type { PasswordHasher } from '../ports/password-hasher.port';
import { User } from '@domain/identity/entities/user.entity';
import { PasswordResetChallenge } from '@domain/identity/entities/password-reset-challenge.entity';

function createMockUser(): User {
  return User.create({
    id: 'user-1',
    fullName: 'Test User',
    email: 'test@example.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'old-hash',
  });
}

function createActiveChallenge(): PasswordResetChallenge {
  return PasswordResetChallenge.reconstitute('c-1', {
    userId: 'user-1',
    otpHash: 'hashed-otp',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    maxAttempts: 5,
    usedAt: null,
    createdAt: new Date(),
  });
}

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

  const challengeRepo: jest.Mocked<PasswordResetChallengeRepository> = {
    save: jest.fn(),
    findLatestActiveByUserId: jest.fn(),
    invalidateActiveByUserId: jest.fn(),
    markUsed: jest.fn(),
    incrementAttempts: jest.fn(),
  };

  const otpHasher: jest.Mocked<OtpHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  const passwordHasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn().mockResolvedValue('new-password-hash'),
    compare: jest.fn(),
  };

  return { userRepo, sessionRepo, challengeRepo, otpHasher, passwordHasher };
}

describe('ConfirmPasswordResetUseCase', () => {
  it('should reset password on happy path', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(createActiveChallenge());
    deps.otpHasher.compare.mockResolvedValue(true);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe('Password reset successful.');
    }
    expect(deps.passwordHasher.hash).toHaveBeenCalledWith('NewPass123!');
    expect(deps.userRepo.save).toHaveBeenCalled();
    expect(deps.sessionRepo.revokeAllByUserIds).toHaveBeenCalledWith(['user-1']);
    expect(deps.challengeRepo.markUsed).toHaveBeenCalledWith('c-1');
  });

  it('should bump tokenVersion on reset', async () => {
    const deps = buildDeps();
    const user = createMockUser();
    deps.userRepo.findByEmail.mockResolvedValue(user);
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(createActiveChallenge());
    deps.otpHasher.compare.mockResolvedValue(true);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    await uc.execute({ email: 'test@example.com', otp: '123456', newPassword: 'NewPass123!' });

    const savedUser = deps.userRepo.save.mock.calls[0]![0];
    expect(savedUser.tokenVersion).toBe(user.tokenVersion + 1);
    expect(savedUser.passwordHash).toBe('new-password-hash');
  });

  it('should return error when user not found', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(null);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'noone@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return error when no active challenge', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(null);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should increment attempts and return error on wrong OTP', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(createActiveChallenge());
    deps.otpHasher.compare.mockResolvedValue(false);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '000000',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
    expect(deps.challengeRepo.incrementAttempts).toHaveBeenCalledWith('c-1');
  });

  it('should return error for expired challenge', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());

    const expiredChallenge = PasswordResetChallenge.reconstitute('c-1', {
      userId: 'user-1',
      otpHash: 'hash',
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(Date.now() - 600000),
    });
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(expiredChallenge);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return error when max attempts exceeded', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());

    const exhaustedChallenge = PasswordResetChallenge.reconstitute('c-1', {
      userId: 'user-1',
      otpHash: 'hash',
      expiresAt: new Date(Date.now() + 60000),
      attempts: 5,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(),
    });
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(exhaustedChallenge);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should return error for already-used challenge', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());

    const usedChallenge = PasswordResetChallenge.reconstitute('c-1', {
      userId: 'user-1',
      otpHash: 'hash',
      expiresAt: new Date(Date.now() + 60000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: new Date(),
      createdAt: new Date(),
    });
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(usedChallenge);

    const uc = new ConfirmPasswordResetUseCase(
      deps.userRepo,
      deps.sessionRepo,
      deps.challengeRepo,
      deps.otpHasher,
      deps.passwordHasher,
    );
    const result = await uc.execute({
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'NewPass123!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });
});
