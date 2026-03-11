import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { Session } from '@domain/identity/entities/session.entity';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { TokenService } from '../ports/token-service.port';
import type { GoogleTokenVerifierPort } from '../ports/google-token-verifier.port';
import { canLogin } from '@domain/identity/rules/auth.rules';
import { AuthErrors } from '../../common/errors';
import { randomUUID } from 'crypto';
import type { LoginOutput } from './login.usecase';

export interface GoogleLoginInput {
  idToken: string;
  deviceId?: string;
}

export class GoogleLoginUseCase {
  constructor(
    private readonly googleVerifier: GoogleTokenVerifierPort,
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
  ) {}

  async execute(input: GoogleLoginInput): Promise<Result<LoginOutput, AppError>> {
    const verifyResult = await this.googleVerifier.verify(input.idToken);
    if (!verifyResult.ok) {
      return err(AuthErrors.invalidCredentials());
    }

    const { email } = verifyResult.value;
    const user = await this.userRepo.findByEmail(email.toLowerCase());
    if (!user) {
      return err(AuthErrors.invalidCredentials());
    }

    const loginCheck = canLogin(user);
    if (!loginCheck.allowed) {
      return err(AuthErrors.inactiveUser(loginCheck.reason!));
    }

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
        phoneNumber: user.phoneE164,
        role: user.role,
        status: user.status,
      },
    });
  }
}
