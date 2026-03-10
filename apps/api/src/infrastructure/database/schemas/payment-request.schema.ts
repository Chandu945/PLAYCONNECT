import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type PaymentRequestDocument = HydratedDocument<PaymentRequestModel>;

@Schema({
  collection: 'payment_requests',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class PaymentRequestModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true })
  studentId!: string;

  @Prop({ required: true })
  feeDueId!: string;

  @Prop({ required: true })
  monthKey!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  staffUserId!: string;

  @Prop({ required: true })
  staffNotes!: string;

  @Prop({ required: true, default: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] })
  status!: string;

  @Prop({ type: String, default: null })
  reviewedByUserId!: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null })
  rejectionReason!: string | null;

  @Prop({ default: 1 })
  version!: number;
}

export const PaymentRequestSchema = SchemaFactory.createForClass(PaymentRequestModel);

PaymentRequestSchema.index({ academyId: 1, status: 1 });
PaymentRequestSchema.index({ academyId: 1, monthKey: 1 });
PaymentRequestSchema.index({ feeDueId: 1, status: 1 });
PaymentRequestSchema.index({ staffUserId: 1, academyId: 1 });
