import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type BatchDocument = HydratedDocument<BatchModel>;

@Schema({
  collection: 'batches',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class BatchModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true, trim: true })
  batchName!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  batchNameNormalized!: string;

  @Prop({ type: [String], default: [] })
  days!: string[];

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, default: null })
  profilePhotoUrl!: string | null;

  @Prop({ type: String, default: null })
  startTime!: string | null;

  @Prop({ type: String, default: null })
  endTime!: string | null;

  @Prop({ type: Number, default: null })
  maxStudents!: number | null;

  @Prop({ required: true, default: 'ACTIVE' })
  status!: string;

  @Prop({ default: 1 })
  version!: number;
}

export const BatchSchema = SchemaFactory.createForClass(BatchModel);

// Unique batch name per academy (case-insensitive via normalized field)
BatchSchema.index({ academyId: 1, batchNameNormalized: 1 }, { unique: true });

// Listing index for paginated queries
BatchSchema.index({ academyId: 1, createdAt: -1 });

// Filter by status
BatchSchema.index({ academyId: 1, status: 1 });
