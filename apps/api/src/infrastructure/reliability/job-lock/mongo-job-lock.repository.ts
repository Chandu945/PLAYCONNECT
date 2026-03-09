import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { JobLockDocument } from './job-lock.schema';
import { JobLockModelName } from './job-lock.schema';
import { getTransactionSession } from '../../database/transaction-context';

@Injectable()
export class MongoJobLockRepository {
  constructor(
    @InjectModel(JobLockModelName)
    private readonly model: Model<JobLockDocument>,
  ) {}

  /**
   * Attempt to acquire a lock atomically.
   * Returns true if lock was acquired, false if another instance holds it.
   */
  async tryAcquire(jobName: string, ttlMs: number, instanceId: string): Promise<boolean> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    const result = await this.model.findOneAndUpdate(
      {
        _id: jobName,
        $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }],
      },
      {
        $set: {
          lockedUntil,
          lockedBy: instanceId,
          updatedAt: now,
        },
      },
      { upsert: true, new: true, session: getTransactionSession() },
    ).catch((err: { code?: number }) => {
      // Duplicate key on upsert race — another instance won
      if (err.code === 11000) return null;
      throw err;
    });

    if (!result) return false;

    return result.lockedBy === instanceId;
  }

  /**
   * Release lock by setting lockedUntil to the past.
   */
  async release(jobName: string, instanceId: string): Promise<void> {
    await this.model.updateOne(
      { _id: jobName, lockedBy: instanceId },
      { $set: { lockedUntil: new Date(0), updatedAt: new Date() } },
      { session: getTransactionSession() },
    );
  }
}
