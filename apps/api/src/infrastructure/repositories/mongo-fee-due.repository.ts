import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { FeeDueModel } from '../database/schemas/fee-due.schema';
import type { FeeDueDocument } from '../database/schemas/fee-due.schema';
import type { FeeDueStatus, PaidSource, PaymentLabel, LateFeeConfig, LateFeeRepeatInterval } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoFeeDueRepository implements FeeDueRepository {
  constructor(@InjectModel(FeeDueModel.name) private readonly model: Model<FeeDueDocument>) {}

  async findById(id: string): Promise<FeeDue | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async save(feeDue: FeeDue): Promise<void> {
    const isNew = feeDue.audit.version === 1;
    const filter: Record<string, unknown> = { _id: feeDue.id.toString() };
    if (!isNew) {
      filter['version'] = feeDue.audit.version - 1;
    }

    const result = await this.model.findOneAndUpdate(
      filter,
      {
        _id: feeDue.id.toString(),
        academyId: feeDue.academyId,
        studentId: feeDue.studentId,
        monthKey: feeDue.monthKey,
        dueDate: feeDue.dueDate,
        amount: feeDue.amount,
        status: feeDue.status,
        paidAt: feeDue.paidAt,
        paidByUserId: feeDue.paidByUserId,
        paidSource: feeDue.paidSource,
        paymentLabel: feeDue.paymentLabel,
        collectedByUserId: feeDue.collectedByUserId,
        approvedByUserId: feeDue.approvedByUserId,
        paymentRequestId: feeDue.paymentRequestId,
        lateFeeApplied: feeDue.lateFeeApplied,
        lateFeeConfigSnapshot: feeDue.lateFeeConfigSnapshot,
        version: feeDue.audit.version,
      },
      { upsert: isNew, session: getTransactionSession() },
    );

    if (!result && !isNew) {
      throw new Error('Concurrent modification detected for FeeDue');
    }
  }

  async bulkSave(feeDues: FeeDue[]): Promise<void> {
    if (feeDues.length === 0) return;
    const ops = feeDues.map((fd) => ({
      updateOne: {
        filter: { _id: fd.id.toString() } as Record<string, unknown>,
        update: {
          $setOnInsert: { _id: fd.id.toString(), createdAt: new Date() },
          $set: {
            academyId: fd.academyId,
            studentId: fd.studentId,
            monthKey: fd.monthKey,
            dueDate: fd.dueDate,
            amount: fd.amount,
            status: fd.status,
            paidAt: fd.paidAt,
            paidByUserId: fd.paidByUserId,
            paidSource: fd.paidSource,
            paymentLabel: fd.paymentLabel,
            collectedByUserId: fd.collectedByUserId,
            approvedByUserId: fd.approvedByUserId,
            paymentRequestId: fd.paymentRequestId,
            lateFeeApplied: fd.lateFeeApplied,
            lateFeeConfigSnapshot: fd.lateFeeConfigSnapshot,
            version: fd.audit.version,
            updatedAt: new Date(),
          },
        } as Record<string, unknown>,
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops as never[], { session: getTransactionSession() });
  }

  async bulkUpdateStatus(ids: string[], status: FeeDueStatus): Promise<void> {
    if (ids.length === 0) return;
    await this.model.updateMany(
      { _id: { $in: ids } },
      { $set: { status, updatedAt: new Date() }, $inc: { version: 1 } },
      { session: getTransactionSession() },
    );
  }

  async findByAcademyStudentMonth(
    academyId: string,
    studentId: string,
    monthKey: string,
  ): Promise<FeeDue | null> {
    const doc = await this.model.findOne({ academyId, studentId, monthKey }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademyMonthAndStatuses(
    academyId: string,
    monthKey: string,
    statuses: FeeDueStatus[],
  ): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ academyId, monthKey, status: { $in: statuses } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listByAcademyMonthPaid(academyId: string, monthKey: string): Promise<FeeDue[]> {
    const docs = await this.model.find({ academyId, monthKey, status: 'PAID' }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listByStudentAndRange(
    academyId: string,
    studentId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<FeeDue[]> {
    const docs = await this.model
      .find({
        academyId,
        studentId,
        monthKey: { $gte: fromMonth, $lte: toMonth },
      })
      .sort({ monthKey: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listUpcomingByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]> {
    const docs = await this.model.find({ academyId, monthKey, status: 'UPCOMING' }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]> {
    const docs = await this.model.find({ academyId, monthKey }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listUnpaidByAcademy(academyId: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ academyId, status: { $in: ['UPCOMING', 'DUE'] } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findUnpaidByDueDate(dueDate: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ dueDate, status: { $in: ['UPCOMING', 'DUE'] } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findOverdueDues(upToDate: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ status: 'DUE', dueDate: { $lte: upToDate } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findDueWithoutSnapshot(academyId: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ academyId, status: 'DUE', lateFeeConfigSnapshot: null })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async deleteUpcomingByStudent(academyId: string, studentId: string): Promise<number> {
    const result = await this.model.deleteMany({ academyId, studentId, status: 'UPCOMING' }, { session: getTransactionSession() });
    return result.deletedCount;
  }

  private toDomain(doc: unknown): FeeDue {
    const d = doc as {
      _id: string;
      academyId: string;
      studentId: string;
      monthKey: string;
      dueDate: string;
      amount: number;
      status: FeeDueStatus;
      paidAt: Date | null;
      paidByUserId: string | null;
      paidSource: string | null;
      paymentLabel: string | null;
      collectedByUserId: string | null;
      approvedByUserId: string | null;
      paymentRequestId: string | null;
      lateFeeApplied?: number | null;
      lateFeeConfigSnapshot?: {
        lateFeeEnabled: boolean;
        gracePeriodDays: number;
        lateFeeAmountInr: number;
        lateFeeRepeatIntervalDays: number;
      } | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return FeeDue.reconstitute(String(d._id), {
      academyId: d.academyId,
      studentId: d.studentId,
      monthKey: d.monthKey,
      dueDate: d.dueDate,
      amount: d.amount,
      status: d.status,
      paidAt: d.paidAt,
      paidByUserId: d.paidByUserId,
      paidSource: (d.paidSource as PaidSource) ?? null,
      paymentLabel: (d.paymentLabel as PaymentLabel) ?? null,
      collectedByUserId: d.collectedByUserId ?? null,
      approvedByUserId: d.approvedByUserId ?? null,
      paymentRequestId: d.paymentRequestId ?? null,
      lateFeeApplied: d.lateFeeApplied ?? null,
      lateFeeConfigSnapshot: d.lateFeeConfigSnapshot
        ? {
            lateFeeEnabled: d.lateFeeConfigSnapshot.lateFeeEnabled,
            gracePeriodDays: d.lateFeeConfigSnapshot.gracePeriodDays,
            lateFeeAmountInr: d.lateFeeConfigSnapshot.lateFeeAmountInr,
            lateFeeRepeatIntervalDays: d.lateFeeConfigSnapshot.lateFeeRepeatIntervalDays as LateFeeRepeatInterval,
          }
        : null,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
