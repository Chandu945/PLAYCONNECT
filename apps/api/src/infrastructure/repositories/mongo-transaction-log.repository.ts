import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import { TransactionLog } from '@domain/fee/entities/transaction-log.entity';
import { TransactionLogModel } from '../database/schemas/transaction-log.schema';
import type { TransactionLogDocument } from '../database/schemas/transaction-log.schema';
import type { PaidSource } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class MongoTransactionLogRepository implements TransactionLogRepository {
  constructor(
    @InjectModel(TransactionLogModel.name)
    private readonly model: Model<TransactionLogDocument>,
  ) {}

  async save(log: TransactionLog): Promise<void> {
    const doc: Record<string, unknown> = {
      _id: log.id.toString(),
      academyId: log.academyId,
      feeDueId: log.feeDueId,
      studentId: log.studentId,
      source: log.source,
      monthKey: log.monthKey,
      amount: log.amount,
      collectedByUserId: log.collectedByUserId,
      approvedByUserId: log.approvedByUserId,
      receiptNumber: log.receiptNumber,
      version: log.audit.version,
    };

    // Only include paymentRequestId when non-null to avoid sparse unique index conflict
    if (log.paymentRequestId) {
      doc['paymentRequestId'] = log.paymentRequestId;
    }

    await this.model.findOneAndUpdate(
      { _id: log.id.toString() },
      doc,
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findByPaymentRequestId(paymentRequestId: string): Promise<TransactionLog | null> {
    const doc = await this.model.findOne({ paymentRequestId }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademy(
    academyId: string,
    page: number,
    pageSize: number,
  ): Promise<TransactionLog[]> {
    const skip = (page - 1) * pageSize;
    const docs = await this.model
      .find({ academyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async countByAcademyAndPrefix(academyId: string, prefix: string): Promise<number> {
    return this.model.countDocuments({
      academyId,
      receiptNumber: { $regex: `^${escapeRegex(prefix)}-` },
    });
  }

  async sumRevenueByAcademyAndDateRange(academyId: string, from: Date, to: Date): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          academyId,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  async listByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<TransactionLog[]> {
    const docs = await this.model
      .find({ academyId, createdAt: { $gte: from, $lte: to } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findByFeeDueId(feeDueId: string): Promise<TransactionLog | null> {
    const doc = await this.model.findOne({ feeDueId }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByStudentIds(studentIds: string[]): Promise<TransactionLog[]> {
    if (studentIds.length === 0) return [];
    const docs = await this.model
      .find({ studentId: { $in: studentIds } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async sumRevenueByAcademyGroupedByMonth(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<{ month: string; total: number }[]> {
    const result = await this.model.aggregate([
      {
        $match: {
          academyId,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return result.map((r: { _id: { year: number; month: number }; total: number }) => ({
      month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      total: r.total,
    }));
  }

  private toDomain(doc: Record<string, unknown>): TransactionLog {
    const d = doc as {
      _id: string;
      academyId: string;
      feeDueId: string;
      paymentRequestId: string | null;
      studentId: string;
      source: PaidSource;
      monthKey: string;
      amount: number;
      collectedByUserId: string;
      approvedByUserId: string;
      receiptNumber: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return TransactionLog.reconstitute(String(d._id), {
      academyId: d.academyId,
      feeDueId: d.feeDueId,
      paymentRequestId: d.paymentRequestId ?? null,
      studentId: d.studentId,
      source: d.source,
      monthKey: d.monthKey,
      amount: d.amount,
      collectedByUserId: d.collectedByUserId,
      approvedByUserId: d.approvedByUserId,
      receiptNumber: d.receiptNumber,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
