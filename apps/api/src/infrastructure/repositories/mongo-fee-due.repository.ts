import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { FeeDueModel } from '../database/schemas/fee-due.schema';
import type { FeeDueDocument } from '../database/schemas/fee-due.schema';
import type {
  FeeDueStatus,
  PaidSource,
  PaymentLabel,
  LateFeeRepeatInterval,
} from '@academyflo/contracts';
import { getTransactionSession } from '../database/transaction-context';
import { ConcurrentModificationError } from '@shared/errors/concurrent-modification.error';

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
      throw new ConcurrentModificationError('FeeDue');
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

  /**
   * Bulk-update fee due statuses.
   *
   * WARNING: This method skips per-document version checks. Unlike `save()`, which uses
   * optimistic concurrency (version filter), this uses `updateMany` and only increments
   * the version — it does NOT verify the previous version. A concurrent `save()` on the
   * same document could be silently overwritten.
   *
   * @param expectedCurrentStatus — if provided, only documents currently in this status
   *   will be updated. This acts as a precondition filter to reduce the blast radius of
   *   race conditions (e.g., avoid overwriting a fee that was concurrently marked PAID).
   */
  async bulkUpdateStatus(
    ids: string[],
    status: FeeDueStatus,
    expectedCurrentStatus?: FeeDueStatus,
  ): Promise<void> {
    if (ids.length === 0) return;
    const filter: Record<string, unknown> = { _id: { $in: ids } };
    if (expectedCurrentStatus) {
      filter['status'] = expectedCurrentStatus;
    }
    await this.model.updateMany(
      filter,
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
      .limit(1000)
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
      .limit(1000)
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async sumUnpaidAmountByAcademy(academyId: string): Promise<number> {
    const result = await this.model
      .aggregate<{
        total: number;
      }>([
        { $match: { academyId, status: { $in: ['UPCOMING', 'DUE'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async sumUnpaidAmountByAcademyAndMonth(academyId: string, monthKey: string): Promise<number> {
    const result = await this.model
      .aggregate<{
        total: number;
      }>([
        { $match: { academyId, monthKey, status: { $in: ['UPCOMING', 'DUE'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async countDistinctUnpaidStudentsByAcademyAndMonth(
    academyId: string,
    monthKey: string,
  ): Promise<number> {
    const result = await this.model
      .aggregate<{
        count: number;
      }>([
        { $match: { academyId, monthKey, status: { $in: ['UPCOMING', 'DUE'] } } },
        { $group: { _id: '$studentId' } },
        { $count: 'count' },
      ])
      .exec();
    return result[0]?.count ?? 0;
  }

  async countUnpaidDuesGroupedByStudent(academyId: string): Promise<Record<string, number>> {
    // One unpaid due == one unpaid month, so grouping by studentId and counting
    // gives each student's total number of unpaid months across the academy.
    const rows = await this.model
      .aggregate<{ _id: string; count: number }>([
        { $match: { academyId, status: { $in: ['UPCOMING', 'DUE'] } } },
        { $group: { _id: '$studentId', count: { $sum: 1 } } },
      ])
      .exec();
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row._id] = row.count;
    return counts;
  }

  async findUnpaidByDueDate(dueDate: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ dueDate, status: { $in: ['UPCOMING', 'DUE'] } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findOverdueDues(upToDate: string, limit = 500): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ status: 'DUE', dueDate: { $lte: upToDate } })
      .limit(limit)
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

  async saveSnapshotIfStillDue(
    id: string,
    snapshot: import('@academyflo/contracts').LateFeeConfig,
  ): Promise<boolean> {
    // Conditional update: only set the snapshot if the fee is still DUE and
    // still un-snapshotted. If a concurrent mark-fee-paid transitioned the
    // record to PAID between the cron's read and this write, the filter
    // doesn't match → modifiedCount is 0 → the PAID state is preserved.
    //
    // Version is incremented so any subsequent optimistic-concurrency save()
    // observes the update — without this, a later save() with the old
    // version+1 would mistakenly think it's still racing the snapshot.
    const result = await this.model
      .updateOne(
        { _id: id, status: 'DUE', lateFeeConfigSnapshot: null },
        {
          $set: { lateFeeConfigSnapshot: snapshot, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { session: getTransactionSession() },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  async deleteUpcomingByStudent(academyId: string, studentId: string): Promise<number> {
    const result = await this.model.deleteMany(
      { academyId, studentId, status: 'UPCOMING' },
      { session: getTransactionSession() },
    );
    return result.deletedCount;
  }

  async sumLateFeeCollectedByAcademyAndMonth(academyId: string, monthKey: string): Promise<number> {
    const result = await this.model
      .aggregate<{
        total: number;
      }>([
        { $match: { academyId, monthKey, status: 'PAID', lateFeeApplied: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$lateFeeApplied' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async sumLateFeeCollectedByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.model
      .aggregate<{ total: number }>([
        {
          $match: {
            academyId,
            status: 'PAID',
            lateFeeApplied: { $gt: 0 },
            paidAt: { $gte: from, $lte: to },
          },
        },
        { $group: { _id: null, total: { $sum: '$lateFeeApplied' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async countOverdueByAcademy(academyId: string, today: string): Promise<number> {
    return this.model.countDocuments({ academyId, status: 'DUE', dueDate: { $lte: today } }).exec();
  }

  async listOverdueByAcademy(academyId: string, today: string): Promise<FeeDue[]> {
    const docs = await this.model
      .find({ academyId, status: 'DUE', dueDate: { $lte: today } })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
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
            lateFeeRepeatIntervalDays: d.lateFeeConfigSnapshot
              .lateFeeRepeatIntervalDays as LateFeeRepeatInterval,
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
