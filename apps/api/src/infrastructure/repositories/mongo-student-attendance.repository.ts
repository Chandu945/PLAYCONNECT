import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import { StudentAttendanceModel } from '../database/schemas/student-attendance.schema';
import type { StudentAttendanceDocument } from '../database/schemas/student-attendance.schema';
import { getTransactionSession } from '../database/transaction-context';
import { escapeRegex } from '@shared/utils/escape-regex';
import { weekdayLabelFromDate } from '@shared/date-utils';

@Injectable()
export class MongoStudentAttendanceRepository implements StudentAttendanceRepository {
  constructor(
    @InjectModel(StudentAttendanceModel.name)
    private readonly model: Model<StudentAttendanceDocument>,
  ) {}

  async save(record: StudentAttendance): Promise<void> {
    // BUG-027: split _id into $setOnInsert so an upsert that matches an
    // existing row (e.g. bulk-set crossing a row that's already ABSENT)
    // doesn't try to overwrite the immutable _id. Previously the inline
    // `_id: record.id.toString()` on the update body crashed with
    // "Performing an update on the path '_id' would modify the immutable
    // field '_id'" whenever the caller passed a fresh UUID for what was
    // actually an update.
    await this.model.findOneAndUpdate(
      {
        academyId: record.academyId,
        studentId: record.studentId,
        batchId: record.batchId,
        date: record.date,
      },
      {
        $setOnInsert: {
          _id: record.id.toString(),
        },
        $set: {
          academyId: record.academyId,
          studentId: record.studentId,
          batchId: record.batchId,
          date: record.date,
          markedByUserId: record.markedByUserId,
          // Default-present model: persist status explicitly. Upsert means a
          // toggle (PRESENT → ABSENT → PRESENT) overwrites the prior status
          // on the same (academy, student, batch, date) row rather than
          // creating duplicate rows or relying on delete-to-mean-absent.
          status: record.status,
          version: record.audit.version,
        },
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async deleteByAcademyStudentBatchDate(
    academyId: string,
    studentId: string,
    batchId: string,
    date: string,
  ): Promise<void> {
    await this.model.deleteOne(
      { academyId, studentId, batchId, date },
      { session: getTransactionSession() },
    );
  }

  async findByAcademyStudentBatchDate(
    academyId: string,
    studentId: string,
    batchId: string,
    date: string,
  ): Promise<StudentAttendance | null> {
    const doc = await this.model
      .findOne({ academyId, studentId, batchId, date })
      .lean()
      .exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findPresentByAcademyBatchAndDate(
    academyId: string,
    batchId: string,
    date: string,
  ): Promise<StudentAttendance[]> {
    // status: 'PRESENT' filter keeps the semantic of this method ("present
    // records only") intact now that the schema stores ABSENT rows too.
    const docs = await this.model
      .find({ academyId, batchId, date, status: 'PRESENT' })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findPresentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<StudentAttendance[]> {
    const docs = await this.model
      .find({ academyId, date, status: 'PRESENT' })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<StudentAttendance[]> {
    // Mirror of findPresentByAcademyAndDate for the default-present daily
    // report. Returns explicit ABSENT rows (with batchId) so the use case can
    // apply the "absent in every scheduled batch" day-level rule.
    const docs = await this.model
      .find({ academyId, date, status: 'ABSENT' })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findPresentByAcademyStudentAndMonth(
    academyId: string,
    studentId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    const docs = await this.model
      .find({
        academyId,
        studentId,
        date: { $regex: `^${escapeRegex(monthPrefix)}` },
        status: 'PRESENT',
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyStudentAndMonth(
    academyId: string,
    studentId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    const docs = await this.model
      .find({
        academyId,
        studentId,
        date: { $regex: `^${escapeRegex(monthPrefix)}` },
        status: 'ABSENT',
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findPresentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    const docs = await this.model
      .find({
        academyId,
        date: { $regex: `^${escapeRegex(monthPrefix)}` },
        status: 'PRESENT',
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    // Mirror of findPresentByAcademyAndMonth for the default-present chart.
    // Same index hits (academyId + date prefix); status filter is selective
    // enough at scale that an extra index isn't needed.
    const docs = await this.model
      .find({
        academyId,
        date: { $regex: `^${escapeRegex(monthPrefix)}` },
        status: 'ABSENT',
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async deleteByAcademyAndDate(academyId: string, date: string): Promise<void> {
    await this.model.deleteMany({ academyId, date }, { session: getTransactionSession() });
  }

  async countPresentByAcademyAndDate(academyId: string, date: string): Promise<number> {
    return this.model.countDocuments({ academyId, date, status: 'PRESENT' });
  }

  async countDistinctStudentsPresentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number> {
    // DB-side distinct so a two-batch student doesn't double the KPI.
    const distinctIds = await this.model.distinct('studentId', {
      academyId,
      date,
      status: 'PRESENT',
    });
    return distinctIds.length;
  }

  async countDistinctStudentsAbsentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number> {
    // Mirror of the PRESENT count for the default-present dashboard metric.
    // Distinct ensures a student absent in two batches the same day counts
    // once toward "students marked absent today".
    const distinctIds = await this.model.distinct('studentId', {
      academyId,
      date,
      status: 'ABSENT',
    });
    return distinctIds.length;
  }

  async countDistinctStudentsAbsentInAllScheduledBatchesByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number> {
    // Strict day-level "absent today" count for the dashboard tile: only
    // counts a student if EVERY batch they're scheduled in on `date` has
    // an explicit ABSENT row. Matches the per-student monthly view's
    // definition of an absent day (presentBatches.size === 0). This means
    // a student absent in their morning batch but present (or unmarked,
    // default-present) in their evening batch is NOT counted as absent on
    // the dashboard — the monthly view would call this a "partial" day.
    //
    // Pipeline shape: start from today's ABSENT records, group by student
    // → set of absent batches, $lookup the student + enrollments + batches
    // to derive scheduled batches today, then keep only rows where every
    // scheduled batch appears in the absent set ($setDifference == ∅).
    const weekday = weekdayLabelFromDate(date);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    const result = await this.model.aggregate<{ count: number }>([
      { $match: { academyId, date, status: 'ABSENT' } },
      { $group: { _id: '$studentId', absentBatches: { $addToSet: '$batchId' } } },
      {
        $lookup: {
          from: 'students',
          let: { studentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$studentId'] },
                    { $eq: ['$academyId', academyId] },
                    { $eq: ['$status', 'ACTIVE'] },
                    { $eq: ['$deletedAt', null] },
                    { $lte: ['$joiningDate', endOfDay] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'student_batches',
                localField: '_id',
                foreignField: 'studentId',
                as: 'enrollments',
              },
            },
            { $unwind: '$enrollments' },
            // BUG-032 parity: ignore enrollments dated after `date` so the
            // scheduled-batch set matches what the marking screen would
            // accept as a writable cell on this day.
            { $match: { $expr: { $lte: ['$enrollments.assignedAt', endOfDay] } } },
            {
              $lookup: {
                from: 'batches',
                localField: 'enrollments.batchId',
                foreignField: '_id',
                as: 'batch',
              },
            },
            { $unwind: '$batch' },
            { $match: { 'batch.days': weekday } },
            { $group: { _id: '$_id', scheduledBatches: { $addToSet: '$batch._id' } } },
          ],
          as: 'student',
        },
      },
      // Drops students who aren't active, joined-by-today, or scheduled
      // today at all — they shouldn't contribute to the dashboard count.
      { $unwind: '$student' },
      {
        $match: {
          $expr: {
            $eq: [
              { $size: { $setDifference: ['$student.scheduledBatches', '$absentBatches'] } },
              0,
            ],
          },
        },
      },
      { $count: 'count' },
    ]);
    return result[0]?.count ?? 0;
  }

  async deleteAllByAcademyAndStudent(
    academyId: string,
    studentId: string,
  ): Promise<number> {
    const res = await this.model.deleteMany(
      { academyId, studentId },
      { session: getTransactionSession() },
    );
    return res.deletedCount ?? 0;
  }

  private toDomain(doc: unknown): StudentAttendance {
    const d = doc as {
      _id: string;
      academyId: string;
      studentId: string;
      batchId: string;
      date: string;
      markedByUserId: string;
      status?: 'PRESENT' | 'ABSENT';
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return StudentAttendance.reconstitute(String(d._id), {
      academyId: d.academyId,
      studentId: d.studentId,
      batchId: d.batchId,
      date: d.date,
      markedByUserId: d.markedByUserId,
      // Pre-status rows (written before the schema gained `status`) read as
      // PRESENT — same default the schema enforces for new rows. This makes
      // the migration a no-op for existing data.
      status: d.status ?? 'PRESENT',
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
