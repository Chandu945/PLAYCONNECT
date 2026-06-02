import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { UserAuthCachePort } from '../../identity/ports/user-auth-cache.port';

export interface LogoutAllInput {
  userId: string;
}

export class LogoutAllUseCase {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly deviceTokenRepo: DeviceTokenRepository,
    /** M3 identity-audit fix: same shape as LogoutUseCase. */
    private readonly userRepo?: UserRepository,
    private readonly auditRecorder?: AuditRecorderPort,
    /** Bust the JwtAuthGuard auth cache so the tokenVersion bump below rejects
     *  other devices' access tokens immediately rather than within the cache TTL. */
    private readonly userAuthCache?: UserAuthCachePort,
  ) {}

  async execute(input: LogoutAllInput): Promise<Result<void, AppError>> {
    await this.sessionRepo.revokeAllByUserIds([input.userId]);
    await this.deviceTokenRepo.removeByUserIds([input.userId]);

    const user = this.userRepo ? await this.userRepo.findById(input.userId) : null;

    // "Log out everywhere" is a deliberate revocation, so reject existing
    // access tokens immediately (not just within their 15m TTL): bump
    // tokenVersion and bust the auth cache. Revoking sessions above already
    // prevents re-minting; this makes the other devices' current tokens fail now.
    if (this.userRepo && user) {
      await this.userRepo.incrementTokenVersionByUserId(input.userId, user.tokenVersion);
      await this.userAuthCache?.invalidate(input.userId);
    }

    if (this.auditRecorder && user && user.academyId) {
      await this.auditRecorder
        .record({
          academyId: user.academyId,
          actorUserId: input.userId,
          action: 'USER_LOGGED_OUT',
          entityType: 'USER',
          entityId: input.userId,
          context: { role: user.role, scope: 'all-devices' },
        })
        .catch(() => {});
    }

    return ok(undefined);
  }
}
