import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { PasswordResetChallengeRepository } from '@domain/identity/ports/password-reset-challenge.repository';
import { PasswordResetChallenge } from '@domain/identity/entities/password-reset-challenge.entity';
import { PasswordResetChallengeModel } from '../database/schemas/password-reset-challenge.schema';
import type { PasswordResetChallengeDocument } from '../database/schemas/password-reset-challenge.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoPasswordResetChallengeRepository implements PasswordResetChallengeRepository {
  constructor(
    @InjectModel(PasswordResetChallengeModel.name)
    private readonly model: Model<PasswordResetChallengeDocument>,
  ) {}

  async save(challenge: PasswordResetChallenge): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: challenge.id.toString() },
      {
        _id: challenge.id.toString(),
        userId: challenge.userId,
        otpHash: challenge.otpHash,
        expiresAt: challenge.expiresAt,
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        usedAt: challenge.usedAt,
        createdAt: challenge.createdAt,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findLatestActiveByUserId(userId: string): Promise<PasswordResetChallenge | null> {
    const doc = await this.model
      .findOne({
        userId,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return doc ? this.toDomain(doc) : null;
  }

  async invalidateActiveByUserId(userId: string): Promise<void> {
    await this.model.updateMany(
      { userId, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { session: getTransactionSession() },
    );
  }

  async markUsed(challengeId: string): Promise<void> {
    await this.model.updateOne({ _id: challengeId }, { $set: { usedAt: new Date() } }, { session: getTransactionSession() });
  }

  async incrementAttempts(challengeId: string): Promise<void> {
    await this.model.updateOne({ _id: challengeId }, { $inc: { attempts: 1 } }, { session: getTransactionSession() });
  }

  private toDomain(doc: Record<string, unknown>): PasswordResetChallenge {
    const d = doc as {
      _id: string;
      userId: string;
      otpHash: string;
      expiresAt: Date;
      attempts: number;
      maxAttempts: number;
      usedAt: Date | null;
      createdAt: Date;
    };

    return PasswordResetChallenge.reconstitute(String(d._id), {
      userId: d.userId,
      otpHash: d.otpHash,
      expiresAt: d.expiresAt,
      attempts: d.attempts,
      maxAttempts: d.maxAttempts,
      usedAt: d.usedAt,
      createdAt: d.createdAt,
    });
  }
}
