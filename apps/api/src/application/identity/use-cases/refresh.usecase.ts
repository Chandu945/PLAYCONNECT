import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { TokenService } from '../ports/token-service.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { AuthErrors } from '../../common/errors';

export interface RefreshInput {
  refreshToken: string;
  deviceId: string;
  userId: string;
}

export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
}

export class RefreshUseCase {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
  ) {}

  async execute(input: RefreshInput): Promise<Result<RefreshOutput, AppError>> {
    const session = await this.sessionRepo.findActiveByDeviceId(input.userId, input.deviceId);
    if (!session || session.isRevoked() || session.isExpired()) {
      return err(AuthErrors.invalidRefreshToken());
    }

    const isValid = this.tokenService.compareRefreshToken(
      input.refreshToken,
      session.refreshTokenHash,
    );
    if (!isValid) {
      // Possible token reuse — revoke session for safety
      await this.sessionRepo.revokeByUserAndDevice(session.userId, session.deviceId);
      return err(AuthErrors.invalidRefreshToken());
    }

    // Rotate: issue new refresh token and update hash (CAS to prevent race condition)
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken);

    const refreshTtlMs = this.refreshTtlSeconds * 1000;
    const updated = await this.sessionRepo.updateRefreshToken(
      session.id.toString(),
      newHash,
      new Date(Date.now() + refreshTtlMs),
      session.refreshTokenHash,
    );
    if (!updated) {
      // Another concurrent request already rotated the token
      return err(AuthErrors.invalidRefreshToken());
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      return err(AuthErrors.invalidRefreshToken());
    }

    // Atomically increment tokenVersion to prevent race conditions
    const bumped = await this.userRepo.incrementTokenVersionByUserId(
      user.id.toString(),
      user.tokenVersion,
    );
    if (!bumped) {
      return err(AuthErrors.invalidRefreshToken());
    }

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id.toString(),
      role: user.role,
      email: user.emailNormalized,
      tokenVersion: user.tokenVersion + 1,
    });

    return ok({
      accessToken,
      refreshToken: newRefreshToken,
    });
  }
}
