import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, FilterQuery } from 'mongoose';
import type {
  StudentRepository,
  StudentListFilter,
  BirthdayStudent,
} from '@domain/student/ports/student.repository';
import { Student } from '@domain/student/entities/student.entity';
import { StudentModel } from '../database/schemas/student.schema';
import type { StudentDocument } from '../database/schemas/student.schema';
import type { Gender, StudentStatus } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoStudentRepository implements StudentRepository {
  constructor(@InjectModel(StudentModel.name) private readonly model: Model<StudentDocument>) {}

  async save(student: Student): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: student.id.toString() },
      {
        _id: student.id.toString(),
        academyId: student.academyId,
        fullName: student.fullName,
        fullNameNormalized: student.fullNameNormalized,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        address: {
          line1: student.address.line1,
          line2: student.address.line2 ?? null,
          city: student.address.city,
          state: student.address.state,
          pincode: student.address.pincode,
        },
        guardian: {
          name: student.guardian.name,
          mobile: student.guardian.mobile,
          email: student.guardian.email,
        },
        joiningDate: student.joiningDate,
        monthlyFee: student.monthlyFee,
        mobileNumber: student.mobileNumber,
        email: student.email,
        profilePhotoUrl: student.profilePhotoUrl,
        fatherName: student.fatherName,
        motherName: student.motherName,
        aadhaarNumber: student.aadhaarNumber,
        caste: student.caste,
        whatsappNumber: student.whatsappNumber,
        addressText: student.addressText,
        instituteInfo: student.instituteInfo,
        passwordHash: student.passwordHash,
        status: student.status,
        statusChangedAt: student.statusChangedAt,
        statusChangedBy: student.statusChangedBy,
        statusHistory: student.statusHistory.map((h) => ({
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          changedBy: h.changedBy,
          changedAt: h.changedAt,
          reason: h.reason,
        })),
        version: student.audit.version,
        deletedAt: student.softDelete.deletedAt,
        deletedBy: student.softDelete.deletedBy,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<Student | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async list(
    filter: StudentListFilter,
    page: number,
    pageSize: number,
  ): Promise<{ students: Student[]; total: number }> {
    const query: FilterQuery<StudentDocument> = {
      academyId: filter.academyId,
      deletedAt: null,
    };

    if (filter.status) {
      query['status'] = filter.status;
    }

    if (filter.search) {
      const normalizedSearch = filter.search.trim().toLowerCase();
      query['fullNameNormalized'] = { $regex: `^${this.escapeRegex(normalizedSearch)}` };
    }

    const skip = (page - 1) * pageSize;

    const [docs, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);

    const students = docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
    return { students, total };
  }

  async listActiveByAcademy(academyId: string): Promise<Student[]> {
    const docs = await this.model
      .find({ academyId, status: 'ACTIVE', deletedAt: null })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async countActiveByAcademy(academyId: string): Promise<number> {
    return this.model.countDocuments({ academyId, status: 'ACTIVE', deletedAt: null });
  }

  async findByIds(ids: string[]): Promise<Student[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids }, deletedAt: null })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async countInactiveByAcademy(academyId: string): Promise<number> {
    return this.model.countDocuments({ academyId, status: 'INACTIVE', deletedAt: null });
  }

  async countNewAdmissionsByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.model.countDocuments({
      academyId,
      status: 'ACTIVE',
      deletedAt: null,
      joiningDate: { $gte: from, $lte: to },
    });
  }

  async findBirthdaysByAcademy(
    academyId: string,
    month: number,
    day?: number,
  ): Promise<BirthdayStudent[]> {
    const matchStage: Record<string, unknown> = {
      academyId,
      status: 'ACTIVE',
      deletedAt: null,
      $expr: {
        $and: [
          { $eq: [{ $month: '$dateOfBirth' }, month] },
          ...(day !== undefined ? [{ $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] }] : []),
        ],
      },
    };

    const docs = await this.model
      .find(matchStage)
      .select({ _id: 1, fullName: 1, profilePhotoUrl: 1, dateOfBirth: 1, 'guardian.mobile': 1 })
      .lean()
      .exec();

    return docs.map((d) => ({
      id: String(d._id),
      fullName: d.fullName,
      profilePhotoUrl: d.profilePhotoUrl ?? null,
      dateOfBirth: d.dateOfBirth,
      guardianMobile: d.guardian.mobile,
    }));
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toDomain(doc: Record<string, unknown>): Student {
    const d = doc as {
      _id: string;
      academyId: string;
      fullName: string;
      fullNameNormalized: string;
      dateOfBirth: Date;
      gender: string;
      address: {
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        pincode: string;
      };
      guardian: {
        name: string;
        mobile: string;
        email: string;
      };
      joiningDate: Date;
      monthlyFee: number;
      mobileNumber: string | null;
      email: string | null;
      profilePhotoUrl: string | null;
      fatherName: string | null;
      motherName: string | null;
      aadhaarNumber: string | null;
      caste: string | null;
      whatsappNumber: string | null;
      addressText: string | null;
      instituteInfo: {
        schoolName: string | null;
        rollNumber: string | null;
        standard: string | null;
      } | null;
      passwordHash: string | null;
      status: string;
      statusChangedAt: Date | null;
      statusChangedBy: string | null;
      statusHistory: {
        fromStatus: string;
        toStatus: string;
        changedBy: string;
        changedAt: Date;
        reason: string | null;
      }[];
      createdAt: Date;
      updatedAt: Date;
      version: number;
      deletedAt: Date | null;
      deletedBy: string | null;
    };

    return Student.reconstitute(String(d._id), {
      academyId: d.academyId,
      fullName: d.fullName,
      fullNameNormalized: d.fullNameNormalized,
      dateOfBirth: d.dateOfBirth,
      gender: d.gender as Gender,
      address: {
        line1: d.address.line1,
        line2: d.address.line2 ?? undefined,
        city: d.address.city,
        state: d.address.state,
        pincode: d.address.pincode,
      },
      guardian: {
        name: d.guardian.name,
        mobile: d.guardian.mobile,
        email: d.guardian.email,
      },
      joiningDate: d.joiningDate,
      monthlyFee: d.monthlyFee,
      mobileNumber: d.mobileNumber,
      email: d.email,
      profilePhotoUrl: d.profilePhotoUrl ?? null,
      fatherName: d.fatherName ?? null,
      motherName: d.motherName ?? null,
      aadhaarNumber: d.aadhaarNumber ?? null,
      caste: d.caste ?? null,
      whatsappNumber: d.whatsappNumber ?? null,
      addressText: d.addressText ?? null,
      instituteInfo: d.instituteInfo ?? null,
      passwordHash: d.passwordHash ?? null,
      status: d.status as StudentStatus,
      statusChangedAt: d.statusChangedAt ?? null,
      statusChangedBy: d.statusChangedBy ?? null,
      statusHistory: (d.statusHistory ?? []).map((h) => ({
        fromStatus: h.fromStatus as StudentStatus,
        toStatus: h.toStatus as StudentStatus,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
        reason: h.reason,
      })),
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
      softDelete: {
        deletedAt: d.deletedAt,
        deletedBy: d.deletedBy,
      },
    });
  }
}
