import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<SessionModel>;

@Schema({
  collection: 'sessions',
  timestamps: false,
  _id: false,
})
export class SessionModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  deviceId!: string;

  @Prop({ required: true })
  refreshTokenHash!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastRotatedAt!: Date | null;

  // Rotation grace window: the prior refresh-token hash and the instant it
  // stops being accepted. Lets a client retry with its previous token after a
  // lost rotation response instead of being force-logged-out as token reuse.
  @Prop({ type: String, default: null })
  previousRefreshTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  previousRefreshTokenExpiresAt!: Date | null;
}

export const SessionSchema = SchemaFactory.createForClass(SessionModel);

// Unique composite index: one active session per (user, device)
SessionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

// TTL index: auto-clean expired sessions after 7 days past expiry
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
