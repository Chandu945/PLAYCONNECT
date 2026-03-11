import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import { StudentAttendanceModel } from '../database/schemas/student-attendance.schema';
import type { StudentAttendanceDocument } from '../database/schemas/student-attendance.schema';
import { getTransactionSession } from '../database/transaction-context';
import { escapeRegex } from '@shared/utils/escape-regex';

@Injectable()
export class MongoStudentAttendanceRepository implements StudentAttendanceRepository {
  constructor(
    @InjectModel(StudentAttendanceModel.name)
    private readonly model: Model<StudentAttendanceDocument>,
  ) {}

  async save(record: StudentAttendance): Promise<void> {
    await this.model.findOneAndUpdate(
      {
        academyId: record.academyId,
        studentId: record.studentId,
        date: record.date,
      },
      {
        _id: record.id.toString(),
        academyId: record.academyId,
        studentId: record.studentId,
        date: record.date,
        markedByUserId: record.markedByUserId,
        version: record.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async deleteByAcademyStudentDate(
    academyId: string,
    studentId: string,
    date: string,
  ): Promise<void> {
    await this.model.deleteOne({ academyId, studentId, date }, { session: getTransactionSession() });
  }

  async findByAcademyStudentDate(
    academyId: string,
    studentId: string,
    date: string,
  ): Promise<StudentAttendance | null> {
    const doc = await this.model.findOne({ academyId, studentId, date }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findAbsentByAcademyAndDate(academyId: string, date: string): Promise<StudentAttendance[]> {
    const docs = await this.model.find({ academyId, date }).lean().exec();
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
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    const docs = await this.model
      .find({
        academyId,
        date: { $regex: `^${escapeRegex(monthPrefix)}` },
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async deleteByAcademyAndDate(academyId: string, date: string): Promise<void> {
    await this.model.deleteMany({ academyId, date }, { session: getTransactionSession() });
  }

  async countAbsentByAcademyAndDate(academyId: string, date: string): Promise<number> {
    return this.model.countDocuments({ academyId, date });
  }

  private toDomain(doc: unknown): StudentAttendance {
    const d = doc as {
      _id: string;
      academyId: string;
      studentId: string;
      date: string;
      markedByUserId: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return StudentAttendance.reconstitute(String(d._id), {
      academyId: d.academyId,
      studentId: d.studentId,
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
