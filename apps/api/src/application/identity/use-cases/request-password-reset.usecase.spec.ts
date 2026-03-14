import { RequestPasswordResetUseCase } from './request-password-reset.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { PasswordResetChallengeRepository } from '@domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../ports/otp-generator.port';
import type { OtpHasher } from '../ports/otp-hasher.port';
import type { EmailSenderPort } from '../../notifications/ports/email-sender.port';
import { User } from '@domain/identity/entities/user.entity';
import { PasswordResetChallenge } from '@domain/identity/entities/password-reset-challenge.entity';

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

  const challengeRepo: jest.Mocked<PasswordResetChallengeRepository> = {
    save: jest.fn(),
    findLatestActiveByUserId: jest.fn(),
    invalidateActiveByUserId: jest.fn(),
    markUsed: jest.fn(),
    incrementAttempts: jest.fn(),
  };

  const otpGenerator: jest.Mocked<OtpGenerator> = {
    generate: jest.fn().mockReturnValue('123456'),
  };

  const otpHasher: jest.Mocked<OtpHasher> = {
    hash: jest.fn().mockResolvedValue('hashed-otp'),
    compare: jest.fn(),
  };

  const emailSender: jest.Mocked<EmailSenderPort> = {
    send: jest.fn().mockResolvedValue(true),
  };

  return { userRepo, challengeRepo, otpGenerator, otpHasher, emailSender };
}

describe('RequestPasswordResetUseCase', () => {
  it('should send OTP email on happy path', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(null);

    const uc = new RequestPasswordResetUseCase(
      deps.userRepo,
      deps.challengeRepo,
      deps.otpGenerator,
      deps.otpHasher,
      deps.emailSender,
    );
    const result = await uc.execute({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toContain('If an account exists');
    }
    expect(deps.otpGenerator.generate).toHaveBeenCalled();
    expect(deps.otpHasher.hash).toHaveBeenCalledWith('123456');
    expect(deps.challengeRepo.save).toHaveBeenCalled();
    expect(deps.emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@example.com' }),
    );
  });

  it('should return same success message when user not found (no enumeration)', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(null);

    const uc = new RequestPasswordResetUseCase(
      deps.userRepo,
      deps.challengeRepo,
      deps.otpGenerator,
      deps.otpHasher,
      deps.emailSender,
    );
    const result = await uc.execute({ email: 'noone@example.com' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toContain('If an account exists');
    }
    expect(deps.emailSender.send).not.toHaveBeenCalled();
  });

  it('should return success without sending email during cooldown', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());

    const recentChallenge = PasswordResetChallenge.reconstitute('c-1', {
      userId: 'user-1',
      otpHash: 'hash',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(), // just created → within cooldown
    });
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(recentChallenge);

    const uc = new RequestPasswordResetUseCase(
      deps.userRepo,
      deps.challengeRepo,
      deps.otpGenerator,
      deps.otpHasher,
      deps.emailSender,
    );
    const result = await uc.execute({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
    expect(deps.emailSender.send).not.toHaveBeenCalled();
    expect(deps.challengeRepo.save).not.toHaveBeenCalled();
  });

  it('should still return success even if email send fails', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(createMockUser());
    deps.challengeRepo.findLatestActiveByUserId.mockResolvedValue(null);
    deps.emailSender.send.mockResolvedValue(false);

    const uc = new RequestPasswordResetUseCase(
      deps.userRepo,
      deps.challengeRepo,
      deps.otpGenerator,
      deps.otpHasher,
      deps.emailSender,
    );
    const result = await uc.execute({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
  });

  it('should normalize email to lowercase', async () => {
    const deps = buildDeps();
    deps.userRepo.findByEmail.mockResolvedValue(null);

    const uc = new RequestPasswordResetUseCase(
      deps.userRepo,
      deps.challengeRepo,
      deps.otpGenerator,
      deps.otpHasher,
      deps.emailSender,
    );
    await uc.execute({ email: '  TEST@Example.COM  ' });

    expect(deps.userRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
  });
});
