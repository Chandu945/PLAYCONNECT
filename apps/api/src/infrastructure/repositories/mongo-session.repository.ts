import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import { Session } from '@domain/identity/entities/session.entity';
import { SessionModel } from '../database/schemas/session.schema';
import type { SessionDocument } from '../database/schemas/session.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoSessionRepository implements SessionRepository {
  constructor(@InjectModel(SessionModel.name) private readonly model: Model<SessionDocument>) {}

  async save(session: Session): Promise<void> {
    await this.model.findOneAndUpdate(
      { userId: session.userId, deviceId: session.deviceId },
      {
        $set: {
          userId: session.userId,
          deviceId: session.deviceId,
          refreshTokenHash: session.refreshTokenHash,
          createdAt: new Date(),
          expiresAt: session.expiresAt,
          revokedAt: null,
          lastRotatedAt: null,
          previousRefreshTokenHash: null,
          previousRefreshTokenExpiresAt: null,
        },
        $setOnInsert: {
          _id: session.id.toString(),
        },
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findByUserAndDevice(userId: string, deviceId: string): Promise<Session | null> {
    const doc = await this.model.findOne({ userId, deviceId, revokedAt: null }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findActiveByDeviceId(userId: string, deviceId: string): Promise<Session | null> {
    const doc = await this.model.findOne({ userId, deviceId, revokedAt: null }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async revokeByUserAndDevice(userId: string, deviceId: string): Promise<void> {
    await this.model.updateMany(
      { userId, deviceId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { session: getTransactionSession() },
    );
  }

  async revokeAllByUserIds(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.model.updateMany(
      { userId: { $in: userIds }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { session: getTransactionSession() },
    );
  }

  async updateRefreshToken(
    sessionId: string,
    newHash: string,
    expiresAt: Date,
    expectedCurrentHash?: string,
    previousHashGraceUntil?: Date,
  ): Promise<boolean> {
    const filter: Record<string, unknown> = { _id: sessionId };
    if (expectedCurrentHash) {
      filter['refreshTokenHash'] = expectedCurrentHash;
    }
    // Carry the outgoing hash into the grace window so a retried (lost-response)
    // refresh is accepted rather than treated as reuse — but ONLY when a grace
    // instant is supplied (a normal rotation). When it isn't (a grace-path
    // redemption), CLEAR the previous slot so the just-redeemed token can't be
    // replayed and a fork is detected as reuse on the next rotation.
    const set: Record<string, unknown> = {
      refreshTokenHash: newHash,
      expiresAt,
      lastRotatedAt: new Date(),
      previousRefreshTokenHash:
        previousHashGraceUntil && expectedCurrentHash ? expectedCurrentHash : null,
      previousRefreshTokenExpiresAt: previousHashGraceUntil ?? null,
    };
    const result = await this.model.updateOne(
      filter,
      { $set: set },
      { session: getTransactionSession() },
    );
    return result.modifiedCount > 0;
  }

  async deleteExpiredAndRevoked(): Promise<number> {
    const now = new Date();
    const result = await this.model.deleteMany({
      $or: [
        { expiresAt: { $lt: now } },
        { revokedAt: { $ne: null } },
      ],
    });
    return result.deletedCount;
  }

  private toDomain(doc: unknown): Session {
    const d = doc as {
      _id: string;
      userId: string;
      deviceId: string;
      refreshTokenHash: string;
      createdAt: Date;
      expiresAt: Date;
      revokedAt: Date | null;
      lastRotatedAt: Date | null;
      previousRefreshTokenHash?: string | null;
      previousRefreshTokenExpiresAt?: Date | null;
    };

    return Session.reconstitute(String(d._id), {
      userId: d.userId,
      deviceId: d.deviceId,
      refreshTokenHash: d.refreshTokenHash,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      revokedAt: d.revokedAt,
      lastRotatedAt: d.lastRotatedAt,
      previousRefreshTokenHash: d.previousRefreshTokenHash ?? null,
      previousRefreshTokenExpiresAt: d.previousRefreshTokenExpiresAt ?? null,
    });
  }
}
