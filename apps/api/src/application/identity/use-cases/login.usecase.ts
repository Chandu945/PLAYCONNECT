import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { User } from '@domain/identity/entities/user.entity';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { Session } from '@domain/identity/entities/session.entity';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { TokenService } from '../ports/token-service.port';
import type { LoginAttemptTracker } from '../services/login-attempt-tracker';
import { canLogin } from '@domain/identity/rules/auth.rules';
import { AuthErrors } from '../../common/errors';
import { randomUUID } from 'crypto';

/** Pre-hashed bcrypt dummy — used to equalize timing when user is not found */
const DUMMY_HASH = '$2b$12$KIX/LMmvTPRYOfx2n2PGauzE7xl8TZsI/2lDh.gPnJRFFWk4RYiGW';

export interface LoginInput {
  identifier: string;
  password: string;
  deviceId?: string;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    role: string;
    status: string;
    profilePhotoUrl: string | null;
  };
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
    private readonly loginAttemptTracker?: LoginAttemptTracker,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput, AppError>> {
    const identifier = input.identifier.trim();
    const identifierLower = identifier.toLowerCase();

    // Check account lockout before any other processing
    if (this.loginAttemptTracker?.isLocked(identifierLower)) {
      return err(AuthErrors.accountLocked());
    }

    let user: User | null = null;

    // Try email first, then phone
    if (identifier.includes('@')) {
      user = await this.userRepo.findByEmail(identifierLower);
    } else {
      user = await this.userRepo.findByPhone(identifier);
    }

    if (!user) {
      await this.passwordHasher.compare(input.password, DUMMY_HASH);
      this.loginAttemptTracker?.recordFailure(identifierLower);
      return err(AuthErrors.invalidCredentials());
    }

    const loginCheck = canLogin(user);
    if (!loginCheck.allowed) {
      return err(AuthErrors.inactiveUser(loginCheck.reason!));
    }

    const passwordValid = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      this.loginAttemptTracker?.recordFailure(identifierLower);
      return err(AuthErrors.invalidCredentials());
    }

    const deviceId = input.deviceId || randomUUID();

    // Revoke existing session for this device
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

    // Reset attempt counter on successful login
    this.loginAttemptTracker?.recordSuccess(identifierLower);

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
        phoneNumber: user.phoneE164,
        role: user.role,
        status: user.status,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    });
  }
}
