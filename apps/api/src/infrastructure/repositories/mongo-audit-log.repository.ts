import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, FilterQuery } from 'mongoose';
import type { AuditLogRepository, AuditLogFilter } from '@domain/audit/ports/audit-log.repository';
import { AuditLog } from '@domain/audit/entities/audit-log.entity';
import { AuditLogModel } from '../database/schemas/audit-log.schema';
import type { AuditLogDocument } from '../database/schemas/audit-log.schema';
import type { AuditActionType, AuditEntityType, Paginated } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoAuditLogRepository implements AuditLogRepository {
  constructor(@InjectModel(AuditLogModel.name) private readonly model: Model<AuditLogDocument>) {}

  async save(log: AuditLog): Promise<void> {
    const doc = {
      _id: log.id.toString(),
      academyId: log.academyId,
      actorUserId: log.actorUserId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      context: log.context,
      createdAt: log.createdAt,
    };
    const session = getTransactionSession();
    if (session) {
      await this.model.create([doc], { session });
    } else {
      await this.model.create(doc);
    }
  }

  async listByAcademy(academyId: string, filter: AuditLogFilter): Promise<Paginated<AuditLog>> {
    const query: FilterQuery<AuditLogDocument> = { academyId };

    if (filter.action) {
      query['action'] = filter.action;
    }
    if (filter.entityType) {
      query['entityType'] = filter.entityType;
    }
    if (filter.from || filter.to) {
      query['createdAt'] = {};
      if (filter.from) {
        query['createdAt']['$gte'] = new Date(`${filter.from}T00:00:00.000Z`);
      }
      if (filter.to) {
        query['createdAt']['$lte'] = new Date(`${filter.to}T23:59:59.999Z`);
      }
    }

    const page = filter.page;
    const pageSize = filter.pageSize;
    const skip = (page - 1) * pageSize;

    const [docs, totalItems] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);

    const items = docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items,
      meta: { page, pageSize, totalItems, totalPages },
    };
  }

  private toDomain(doc: Record<string, unknown>): AuditLog {
    const d = doc as {
      _id: string;
      academyId: string;
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      context: Record<string, string> | null;
      createdAt: Date;
    };

    return AuditLog.reconstitute(String(d._id), {
      academyId: d.academyId,
      actorUserId: d.actorUserId,
      action: d.action as AuditActionType,
      entityType: d.entityType as AuditEntityType,
      entityId: d.entityId,
      context: d.context,
      createdAt: d.createdAt,
    });
  }
}
