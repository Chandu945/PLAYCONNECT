import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type ParentStudentLinkDocument = HydratedDocument<ParentStudentLinkModel>;

@Schema({
  collection: 'parentStudentLinks',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  _id: false,
})
export class ParentStudentLinkModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  parentUserId!: string;

  @Prop({ required: true })
  studentId!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ default: 1 })
  version!: number;
}

export const ParentStudentLinkSchema = SchemaFactory.createForClass(ParentStudentLinkModel);

ParentStudentLinkSchema.index({ parentUserId: 1, studentId: 1 }, { unique: true });
ParentStudentLinkSchema.index({ parentUserId: 1 });
ParentStudentLinkSchema.index({ studentId: 1 });
ParentStudentLinkSchema.index({ academyId: 1 });
