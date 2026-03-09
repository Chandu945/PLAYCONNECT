import type { Session } from '../entities/session.entity';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findByUserAndDevice(userId: string, deviceId: string): Promise<Session | null>;
  findActiveByDeviceId(userId: string, deviceId: string): Promise<Session | null>;
  revokeByUserAndDevice(userId: string, deviceId: string): Promise<void>;
  updateRefreshToken(sessionId: string, newHash: string, expiresAt: Date, expectedCurrentHash?: string): Promise<boolean>;
  revokeAllByUserIds(userIds: string[]): Promise<void>;
}
