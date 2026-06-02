import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { TokenService } from '../ports/token-service.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canLogin } from '@domain/identity/rules/auth.rules';
import { AuthErrors } from '../../common/errors';

export interface RefreshInput {
  refreshToken: string;
  deviceId: string;
  userId: string;
}

export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    role: string;
    profilePhotoUrl: string | null;
  };
}

/**
 * Window during which a session's immediately-previous refresh token is still
 * accepted after rotation. Tolerates a lost/dropped rotation response so the
 * client's retry with its prior token is NOT mistaken for token reuse (which
 * would force an undesired automatic logout).
 *
 * The grace is ONE-SHOT and armed only on a normal (current-token) rotation.
 * Redeeming the previous token via the grace path clears the previous slot (we
 * omit graceUntil below), so the same token can't be replayed twice and the
 * lineage can't "ping-pong". A token older than the single in-grace previous —
 * or a replay after the grace was consumed — matches neither current nor
 * previous and therefore revokes the session (reuse/fork detection), exactly as
 * the pre-grace code did, just relaxed by one generation for 60s.
 */
const ROTATION_GRACE_MS = 60_000;

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

    const matchesCurrent = this.tokenService.compareRefreshToken(
      input.refreshToken,
      session.refreshTokenHash,
    );

    // Rotation grace: if the presented token isn't the current one but matches
    // the immediately-previous hash within the grace window, accept it. This is
    // the lost-rotation-response retry — not reuse.
    const matchesPreviousInGrace =
      !matchesCurrent &&
      session.isWithinRotationGrace() &&
      session.previousRefreshTokenHash !== null &&
      this.tokenService.compareRefreshToken(
        input.refreshToken,
        session.previousRefreshTokenHash,
      );

    if (!matchesCurrent && !matchesPreviousInGrace) {
      // Genuine token reuse / theft (or a token from beyond the grace window) —
      // revoke session for safety.
      await this.sessionRepo.revokeByUserAndDevice(session.userId, session.deviceId);
      return err(AuthErrors.invalidRefreshToken());
    }

    // Rotate: issue new refresh token and update hash (CAS to prevent race
    // condition). CAS is on the CURRENT hash in both paths — in the grace path
    // the DB current hash is the successor the client may never have received.
    // Arm the grace window ONLY on a normal rotation; a grace-path redemption
    // omits it (graceUntil = undefined) so the previous slot is cleared and the
    // just-redeemed token cannot be replayed — see ROTATION_GRACE_MS.
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken);

    const refreshTtlMs = this.refreshTtlSeconds * 1000;
    const updated = await this.sessionRepo.updateRefreshToken(
      session.id.toString(),
      newHash,
      new Date(Date.now() + refreshTtlMs),
      session.refreshTokenHash,
      matchesCurrent ? new Date(Date.now() + ROTATION_GRACE_MS) : undefined,
    );
    if (!updated) {
      // Another concurrent request already rotated the token
      return err(AuthErrors.invalidRefreshToken());
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      return err(AuthErrors.invalidRefreshToken());
    }

    // M1 identity-audit fix: re-check user status. A user deactivated /
    // login-disabled between login and refresh could otherwise keep
    // minting access tokens via the refresh endpoint for the lifetime of
    // their refresh token (30d default). canLogin centralises the rules
    // for inactive accounts, login-disabled academies, soft-deleted
    // users, etc. — the same gate login.usecase enforces.
    const loginCheck = canLogin(user);
    if (!loginCheck.allowed) {
      return err(AuthErrors.inactiveUser(loginCheck.reason!));
    }

    // Routine refresh does NOT bump tokenVersion. Access tokens are short-lived
    // (15m) and self-expiring, so there is no need to revoke previously-issued
    // tokens here — doing so invalidated other devices' and concurrent
    // requests' still-valid access tokens ("Token revoked" thrash). tokenVersion
    // is reserved for DELIBERATE revocation: logout-all, password reset/change,
    // admin force-logout, academy disable, and account deactivation/deletion —
    // each of which also revokes the refresh session, so logout still happens.
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id.toString(),
      role: user.role,
      email: user.emailNormalized,
      academyId: user.academyId,
      tokenVersion: user.tokenVersion,
    });

    return ok({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id.toString(),
        fullName: user.fullName,
        email: user.emailNormalized,
        phoneNumber: user.phoneE164,
        role: user.role,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    });
  }
}
