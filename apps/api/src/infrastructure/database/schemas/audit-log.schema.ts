import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLogModel>;

@Schema({
  collection: 'audit_logs',
  timestamps: false,
  _id: false,
})
export class AuditLogModel {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  academyId!: string;

  @Prop({ required: true })
  actorUserId!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true })
  entityId!: string;

  @Prop({ type: Object, default: null })
  context!: Record<string, string> | null;

  @Prop({ required: true, type: Date })
  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogModel);

// Listing: by academy, newest first
AuditLogSchema.index({ academyId: 1, createdAt: -1 });

// Filtering: by academy + action, newest first
AuditLogSchema.index({ academyId: 1, action: 1, createdAt: -1 });

// Filtering: by academy + entityType, newest first
AuditLogSchema.index({ academyId: 1, entityType: 1, createdAt: -1 });
