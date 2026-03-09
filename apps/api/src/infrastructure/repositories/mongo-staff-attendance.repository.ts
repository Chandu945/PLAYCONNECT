import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { StaffAttendanceRepository } from '@domain/staff-attendance/ports/staff-attendance.repository';
import { StaffAttendance } from '@domain/staff-attendance/entities/staff-attendance.entity';
import { StaffAttendanceModel } from '../database/schemas/staff-attendance.schema';
import type { StaffAttendanceDocument } from '../database/schemas/staff-attendance.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoStaffAttendanceRepository implements StaffAttendanceRepository {
  constructor(
    @InjectModel(StaffAttendanceModel.name)
    private readonly model: Model<StaffAttendanceDocument>,
  ) {}

  async save(record: StaffAttendance): Promise<void> {
    await this.model.findOneAndUpdate(
      {
        academyId: record.academyId,
        staffUserId: record.staffUserId,
        date: record.date,
      },
      {
        _id: record.id.toString(),
        academyId: record.academyId,
        staffUserId: record.staffUserId,
        date: record.date,
        markedByUserId: record.markedByUserId,
        version: record.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async deleteByAcademyStaffDate(
    academyId: string,
    staffUserId: string,
    date: string,
  ): Promise<void> {
    await this.model.deleteOne({ academyId, staffUserId, date }, { session: getTransactionSession() });
  }

  async findAbsentByAcademyAndDate(academyId: string, date: string): Promise<StaffAttendance[]> {
    const docs = await this.model.find({ academyId, date }).lean().exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyDateAndStaffIds(
    academyId: string,
    date: string,
    staffUserIds: string[],
  ): Promise<StaffAttendance[]> {
    if (staffUserIds.length === 0) return [];
    const docs = await this.model
      .find({ academyId, date, staffUserId: { $in: staffUserIds } })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StaffAttendance[]> {
    const docs = await this.model
      .find({ academyId, date: { $regex: `^${monthPrefix}` } })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async countAbsentByAcademyStaffAndMonth(
    academyId: string,
    staffUserId: string,
    monthPrefix: string,
  ): Promise<number> {
    return this.model.countDocuments({
      academyId,
      staffUserId,
      date: { $regex: `^${monthPrefix}` },
    });
  }

  private toDomain(doc: Record<string, unknown>): StaffAttendance {
    const d = doc as {
      _id: string;
      academyId: string;
      staffUserId: string;
      date: string;
      markedByUserId: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return StaffAttendance.reconstitute(String(d._id), {
      academyId: d.academyId,
      staffUserId: d.staffUserId,
      date: d.date,
      markedByUserId: d.markedByUserId,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
