import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type FeePaymentDocument = HydratedDocument<FeePaymentModel>;

@Schema({
  collection: 'feePayments',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class FeePaymentModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true })
  parentUserId!: string;

  @Prop({ required: true })
  studentId!: string;

  @Prop({ required: true })
  feeDueId!: string;

  @Prop({ required: true })
  monthKey!: string;

  @Prop({ required: true, unique: true })
  orderId!: string;

  @Prop({ type: String, default: null, sparse: true, unique: true })
  cfOrderId!: string | null;

  @Prop({ required: true })
  paymentSessionId!: string;

  @Prop({ required: true })
  baseAmount!: number;

  @Prop({ required: true, default: 0 })
  convenienceFee!: number;

  @Prop({ required: true })
  totalAmount!: number;

  @Prop({ type: Number, default: 0 })
  lateFeeSnapshot!: number;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

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

export const FeePaymentSchema = SchemaFactory.createForClass(FeePaymentModel);

FeePaymentSchema.index({ academyId: 1, createdAt: -1 });
FeePaymentSchema.index(
  { feeDueId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
