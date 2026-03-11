import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { User } from '@domain/identity/entities/user.entity';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { Session } from '@domain/identity/entities/session.entity';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { TokenService } from '../ports/token-service.port';
import { canLogin } from '@domain/identity/rules/auth.rules';
import { AuthErrors } from '../../common/errors';
import { randomUUID } from 'crypto';

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
  };
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput, AppError>> {
    const identifier = input.identifier.trim();
    let user: User | null = null;

    // Try email first, then phone
    if (identifier.includes('@')) {
      user = await this.userRepo.findByEmail(identifier.toLowerCase());
    } else {
      user = await this.userRepo.findByPhone(identifier);
    }

    if (!user) {
      return err(AuthErrors.invalidCredentials());
    }

    const loginCheck = canLogin(user);
    if (!loginCheck.allowed) {
      return err(AuthErrors.inactiveUser(loginCheck.reason!));
    }

    const passwordValid = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordValid) {
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
      },
    });
  }
}
