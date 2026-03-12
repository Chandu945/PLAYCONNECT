import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type SubscriptionPaymentDocument = HydratedDocument<SubscriptionPaymentModel>;

@Schema({
  collection: 'subscriptionPayments',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class SubscriptionPaymentModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true })
  ownerUserId!: string;

  @Prop({ required: true, unique: true })
  orderId!: string;

  @Prop({ type: String, default: null })
  cfOrderId!: string | null;

  @Prop({ required: true })
  paymentSessionId!: string;

  @Prop({ required: true, enum: ['TIER_0_50', 'TIER_51_100', 'TIER_101_PLUS'] })
  tierKey!: string;

  @Prop({ required: true })
  amountInr!: number;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

  @Prop({ required: true })
  activeStudentCountAtPurchase!: number;

  @Prop({ required: true, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' })
  status!: string;

  @Prop({ type: String, default: null })
  failureReason!: string | null;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  @Prop({ type: String, default: null })
  providerPaymentId!: string | null;

  @Prop({ default: 1 })
  version!: number;
}

export const SubscriptionPaymentSchema = SchemaFactory.createForClass(SubscriptionPaymentModel);

// Indexes
SubscriptionPaymentSchema.index({ academyId: 1, createdAt: -1 });
SubscriptionPaymentSchema.index(
  { cfOrderId: 1 },
  { unique: true, partialFilterExpression: { cfOrderId: { $type: 'string' } } },
);
// Partial unique index: one PENDING per academy
SubscriptionPaymentSchema.index(
  { academyId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
