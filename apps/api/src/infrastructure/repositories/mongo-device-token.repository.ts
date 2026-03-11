import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  DeviceTokenModel,
  type DeviceTokenDocument,
} from '@infrastructure/database/schemas/device-token.schema';
import type {
  DeviceToken,
  DeviceTokenRepository,
} from '@domain/notification/ports/device-token.repository';

@Injectable()
export class MongoDeviceTokenRepository implements DeviceTokenRepository {
  constructor(
    @InjectModel(DeviceTokenModel.name)
    private readonly model: Model<DeviceTokenDocument>,
  ) {}

  async upsert(userId: string, fcmToken: string, platform: string): Promise<void> {
    const now = new Date();
    await this.model.findOneAndUpdate(
      { userId, fcmToken },
      {
        $set: { platform, updatedAt: now },
        $setOnInsert: { _id: uuidv4(), createdAt: now },
      },
      { upsert: true },
    );
  }

  async removeByToken(fcmToken: string): Promise<void> {
    await this.model.deleteMany({ fcmToken });
  }

  async removeByUserIdAndToken(userId: string, fcmToken: string): Promise<void> {
    await this.model.deleteOne({ userId, fcmToken });
  }

  async findByUserId(userId: string): Promise<DeviceToken[]> {
    const docs = await this.model.find({ userId }).lean();
    return docs.map(this.toDomain);
  }

  async findByUserIds(userIds: string[]): Promise<DeviceToken[]> {
    if (userIds.length === 0) return [];
    const docs = await this.model.find({ userId: { $in: userIds } }).lean();
    return docs.map(this.toDomain);
  }

  private toDomain(doc: unknown): DeviceToken {
    const d = doc as Record<string, unknown>;
    return {
      id: d['_id'] as string,
      userId: d['userId'] as string,
      fcmToken: d['fcmToken'] as string,
      platform: d['platform'] as string,
      createdAt: d['createdAt'] as Date,
      updatedAt: d['updatedAt'] as Date,
    };
  }
}
