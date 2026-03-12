import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type FeeDueDocument = HydratedDocument<FeeDueModel>;

@Schema({
  collection: 'fee_dues',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class FeeDueModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true })
  studentId!: string;

  @Prop({ required: true })
  monthKey!: string;

  @Prop({ required: true })
  dueDate!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, default: 'UPCOMING', enum: ['UPCOMING', 'DUE', 'PAID'] })
  status!: string;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  @Prop({ type: String, default: null })
  paidByUserId!: string | null;

  @Prop({ type: String, default: null })
  paidSource!: string | null;

  @Prop({ type: String, default: null })
  paymentLabel!: string | null;

  @Prop({ type: String, default: null })
  collectedByUserId!: string | null;

  @Prop({ type: String, default: null })
  approvedByUserId!: string | null;

  @Prop({ type: String, default: null })
  paymentRequestId!: string | null;

  @Prop({ type: Number, default: null })
  lateFeeApplied!: number | null;

  @Prop({ type: Object, default: null })
  lateFeeConfigSnapshot!: {
    lateFeeEnabled: boolean;
    gracePeriodDays: number;
    lateFeeAmountInr: number;
    lateFeeRepeatIntervalDays: number;
  } | null;

  @Prop({ default: 1 })
  version!: number;
}

export const FeeDueSchema = SchemaFactory.createForClass(FeeDueModel);

FeeDueSchema.index({ academyId: 1, studentId: 1, monthKey: 1 }, { unique: true });
FeeDueSchema.index({ academyId: 1, monthKey: 1, status: 1 });
FeeDueSchema.index({ dueDate: 1, status: 1 });
