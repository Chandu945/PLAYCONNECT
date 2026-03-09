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

  async updateRefreshToken(sessionId: string, newHash: string, expiresAt: Date, expectedCurrentHash?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { _id: sessionId };
    if (expectedCurrentHash) {
      filter.refreshTokenHash = expectedCurrentHash;
    }
    const result = await this.model.updateOne(
      filter,
      {
        $set: {
          refreshTokenHash: newHash,
          expiresAt,
          lastRotatedAt: new Date(),
        },
      },
      { session: getTransactionSession() },
    );
    return result.modifiedCount > 0;
  }

  private toDomain(doc: Record<string, unknown>): Session {
    const d = doc as {
      _id: string;
      userId: string;
      deviceId: string;
      refreshTokenHash: string;
      createdAt: Date;
      expiresAt: Date;
      revokedAt: Date | null;
      lastRotatedAt: Date | null;
    };

    return Session.reconstitute(String(d._id), {
      userId: d.userId,
      deviceId: d.deviceId,
      refreshTokenHash: d.refreshTokenHash,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      revokedAt: d.revokedAt,
      lastRotatedAt: d.lastRotatedAt,
    });
  }
}
