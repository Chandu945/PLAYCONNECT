export const DEVICE_TOKEN_REPOSITORY = Symbol('DEVICE_TOKEN_REPOSITORY');

export interface DeviceToken {
  id: string;
  userId: string;
  fcmToken: string;
  platform: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceTokenRepository {
  upsert(userId: string, fcmToken: string, platform: string): Promise<void>;
  removeByToken(fcmToken: string): Promise<void>;
  removeByUserIdAndToken(userId: string, fcmToken: string): Promise<void>;
  findByUserId(userId: string): Promise<DeviceToken[]>;
  findByUserIds(userIds: string[]): Promise<DeviceToken[]>;
}
