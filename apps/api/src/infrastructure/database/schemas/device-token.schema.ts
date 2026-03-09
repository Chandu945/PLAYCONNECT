import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type DeviceTokenDocument = HydratedDocument<DeviceTokenModel>;

@Schema({
  collection: 'device_tokens',
  timestamps: false,
  _id: false,
})
export class DeviceTokenModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  fcmToken!: string;

  @Prop({ required: true, enum: ['android', 'ios', 'web'] })
  platform!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  updatedAt!: Date;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceTokenModel);

// One token per user+fcmToken combo
DeviceTokenSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });

// Look up tokens by userId for sending push notifications
DeviceTokenSchema.index({ userId: 1 });

// TTL: auto-clean stale tokens after 90 days of no update
DeviceTokenSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
