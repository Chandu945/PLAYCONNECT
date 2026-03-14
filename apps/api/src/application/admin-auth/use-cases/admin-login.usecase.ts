import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { Session } from '@domain/identity/entities/session.entity';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordHasher } from '../../identity/ports/password-hasher.port';
import type { TokenService } from '../../identity/ports/token-service.port';
import type { LoginAttemptTracker } from '../../identity/services/login-attempt-tracker';
import { AuthErrors } from '../../common/errors';
import { AdminErrors } from '../../common/errors';
import { randomUUID } from 'crypto';

/** Pre-hashed bcrypt dummy — used to equalize timing when user is not found */
const DUMMY_HASH = '$2b$12$KIX/LMmvTPRYOfx2n2PGauzE7xl8TZsI/2lDh.gPnJRFFWk4RYiGW';

export interface AdminLoginInput {
  email: string;
  password: string;
  deviceId?: string;
}

export interface AdminLoginOutput {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

export class AdminLoginUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
    private readonly loginAttemptTracker?: LoginAttemptTracker,
  ) {}

  async execute(input: AdminLoginInput): Promise<Result<AdminLoginOutput, AppError>> {
    const emailLower = input.email.trim().toLowerCase();

    if (this.loginAttemptTracker?.isLocked(emailLower)) {
      return err(AuthErrors.accountLocked());
    }

    const user = await this.userRepo.findByEmail(emailLower);

    if (!user) {
      await this.passwordHasher.compare(input.password, DUMMY_HASH);
      this.loginAttemptTracker?.recordFailure(emailLower);
      return err(AuthErrors.invalidCredentials());
    }

    if (user.role !== 'SUPER_ADMIN') {
      return err(AdminErrors.notSuperAdmin());
    }

    if (!user.isActive()) {
      return err(AuthErrors.invalidCredentials());
    }

    const passwordValid = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      this.loginAttemptTracker?.recordFailure(emailLower);
      return err(AuthErrors.invalidCredentials());
    }

    this.loginAttemptTracker?.recordSuccess(emailLower);

    const deviceId = input.deviceId || randomUUID();

    await this.sessionRepo.revokeByUserAndDevice(user.id.toString(), deviceId);

    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const refreshTtlMs = this.refreshTtlSeconds * 1000;
    const session = Session.create({
      id: randomUUID(),
      userId: user.id.toString(),
      deviceId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    await this.sessionRepo.save(session);

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id.toString(),
      role: user.role,
      email: user.emailNormalized,
      tokenVersion: user.tokenVersion,
    });

    return ok({
      accessToken,
      refreshToken,
      deviceId,
      user: {
        id: user.id.toString(),
        fullName: user.fullName,
        email: user.emailNormalized,
        role: user.role,
      },
    });
  }
}
