import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type AcademyDocument = HydratedDocument<AcademyModel>;

class AddressSubdocument {
  @Prop({ required: true, trim: true })
  line1!: string;

  @Prop({ trim: true })
  line2?: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  state!: string;

  @Prop({ required: true, trim: true })
  pincode!: string;

  @Prop({ required: true, trim: true, default: 'India' })
  country!: string;
}

@Schema({
  collection: 'academies',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class AcademyModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, unique: true })
  ownerUserId!: string;

  @Prop({ required: true, trim: true })
  academyName!: string;

  @Prop({ type: AddressSubdocument, required: true })
  address!: AddressSubdocument;

  @Prop({ default: false })
  loginDisabled!: boolean;

  @Prop({ type: Date, default: null })
  deactivatedAt!: Date | null;

  @Prop({ type: Number, default: null })
  defaultDueDateDay!: number | null;

  @Prop({ type: String, default: null })
  receiptPrefix!: string | null;

  @Prop({ type: Boolean, default: false })
  lateFeeEnabled!: boolean;

  @Prop({ type: Number, default: 5 })
  gracePeriodDays!: number;

  @Prop({ type: Number, default: 0 })
  lateFeeAmountInr!: number;

  @Prop({ type: Number, default: 5 })
  lateFeeRepeatIntervalDays!: number;

  @Prop({ type: Object, default: null })
  instituteInfo!: {
    signatureStampUrl: string | null;
    bankDetails: {
      accountHolderName: string;
      accountNumber: string;
      ifscCode: string;
      bankName: string;
      branchName: string;
    } | null;
    upiId: string | null;
    qrCodeImageUrl: string | null;
  } | null;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: String, default: null })
  deletedBy!: string | null;
}

export const AcademySchema = SchemaFactory.createForClass(AcademyModel);
