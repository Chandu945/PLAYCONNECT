import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import type {
  StudentQueryRepository,
  StudentListQuery,
  StudentListRow,
} from '@domain/student/ports/student-query.repository';
import { StudentModel } from '../database/schemas/student.schema';
import type { StudentDocument } from '../database/schemas/student.schema';
import { FeeDueModel } from '../database/schemas/fee-due.schema';
import type { FeeDueDocument } from '../database/schemas/fee-due.schema';
import { toMonthKeyFromDate } from '@shared/date-utils';
import type { Gender, StudentStatus } from '@playconnect/contracts';
import { escapeRegex } from '@shared/utils/escape-regex';

@Injectable()
export class MongoStudentQueryRepository implements StudentQueryRepository {
  constructor(
    @InjectModel(StudentModel.name) private readonly studentModel: Model<StudentDocument>,
    @InjectModel(FeeDueModel.name) private readonly feeDueModel: Model<FeeDueDocument>,
  ) {}

  async listWithFeeFilter(
    query: StudentListQuery,
    page: number,
    pageSize: number,
  ): Promise<{ rows: StudentListRow[]; total: number }> {
    if (!query.feeFilter || query.feeFilter === 'ALL') {
      return this.listSimple(query, page, pageSize);
    }

    return this.listWithAggregation(query, page, pageSize);
  }

  private async listSimple(
    query: StudentListQuery,
    page: number,
    pageSize: number,
  ): Promise<{ rows: StudentListRow[]; total: number }> {
    const filter: Record<string, unknown> = {
      academyId: query.academyId,
      deletedAt: null,
    };

    if (query.status) {
      filter['status'] = query.status;
    }

    if (query.search) {
      const normalizedSearch = query.search.trim().toLowerCase();
      filter['fullNameNormalized'] = { $regex: `^${escapeRegex(normalizedSearch)}` };
    }

    const skip = (page - 1) * pageSize;

    const [docs, total] = await Promise.all([
      this.studentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      this.studentModel.countDocuments(filter).exec(),
    ]);

    const rows = docs.map((doc) => this.toRow(doc as unknown as Record<string, unknown>));
    return { rows, total };
  }

  private async listWithAggregation(
    query: StudentListQuery,
    page: number,
    pageSize: number,
  ): Promise<{ rows: StudentListRow[]; total: number }> {
    const monthKey = query.month ?? toMonthKeyFromDate(new Date());
    const targetStatuses = query.feeFilter === 'DUE' ? ['UPCOMING', 'DUE'] : ['PAID'];

    const matchStage: Record<string, unknown> = {
      academyId: query.academyId,
      deletedAt: null,
    };

    if (query.status) {
      matchStage['status'] = query.status;
    }

    if (query.search) {
      const normalizedSearch = query.search.trim().toLowerCase();
      matchStage['fullNameNormalized'] = {
        $regex: `^${escapeRegex(normalizedSearch)}`,
      };
    }

    const skip = (page - 1) * pageSize;

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'fee_dues',
          let: { studentId: { $toString: '$_id' }, academyId: '$academyId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$studentId', '$$studentId'] },
                    { $eq: ['$academyId', '$$academyId'] },
                    { $eq: ['$monthKey', monthKey] },
                    { $in: ['$status', targetStatuses] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'feeDues',
        },
      },
      { $match: { 'feeDues.0': { $exists: true } } },
      { $sort: { createdAt: -1 as const } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: pageSize }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.studentModel.aggregate(pipeline).exec();

    const docs = result?.data ?? [];
    const total = result?.total?.[0]?.count ?? 0;

    const rows = docs.map((doc: Record<string, unknown>) => this.toRow(doc));
    return { rows, total };
  }

  private toRow(doc: unknown): StudentListRow {
    const d = doc as {
      _id: string;
      academyId: string;
      fullName: string;
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
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      id: String(d._id),
      academyId: d.academyId,
      fullName: d.fullName,
      dateOfBirth: new Date(d.dateOfBirth).toISOString().slice(0, 10),
      gender: d.gender as Gender,
      address: {
        line1: d.address.line1,
        line2: d.address.line2 ?? null,
        city: d.address.city,
        state: d.address.state,
        pincode: d.address.pincode,
      },
      guardian: {
        name: d.guardian.name,
        mobile: d.guardian.mobile,
        email: d.guardian.email,
      },
      joiningDate: new Date(d.joiningDate).toISOString().slice(0, 10),
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
      hasPassword: !!d.passwordHash,
      status: d.status as StudentStatus,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
