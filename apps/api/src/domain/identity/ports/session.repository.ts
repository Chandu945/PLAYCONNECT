import type { Session } from '../entities/session.entity';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findByUserAndDevice(userId: string, deviceId: string): Promise<Session | null>;
  findActiveByDeviceId(userId: string, deviceId: string): Promise<Session | null>;
  revokeByUserAndDevice(userId: string, deviceId: string): Promise<void>;
  /**
   * Rotate the session's refresh-token hash (CAS on `expectedCurrentHash`).
   * When `previousHashGraceUntil` is supplied, the old hash is retained as
   * `previousRefreshTokenHash` and accepted until that instant (rotation
   * grace), so a lost rotation response does not force a logout on retry.
   */
  updateRefreshToken(
    sessionId: string,
    newHash: string,
    expiresAt: Date,
    expectedCurrentHash?: string,
    previousHashGraceUntil?: Date,
  ): Promise<boolean>;
  revokeAllByUserIds(userIds: string[]): Promise<void>;
  deleteExpiredAndRevoked(): Promise<number>;
}
