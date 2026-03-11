import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { User } from '@domain/identity/entities/user.entity';
import type { UserStatus } from '@domain/identity/entities/user.entity';
import { Email } from '@domain/identity/value-objects/email.vo';
import { Phone } from '@domain/identity/value-objects/phone.vo';
import { UserModel } from '../database/schemas/user.schema';
import type { UserDocument } from '../database/schemas/user.schema';
import type { UserRole } from '@playconnect/contracts';
import type { StaffQualificationInfo, StaffSalaryConfig, SalaryFrequency } from '@domain/identity/entities/user.entity';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoUserRepository implements UserRepository {
  constructor(@InjectModel(UserModel.name) private readonly model: Model<UserDocument>) {}

  async save(user: User): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: user.id.toString() },
      {
        _id: user.id.toString(),
        fullName: user.fullName,
        emailNormalized: user.emailNormalized,
        phoneE164: user.phoneE164,
        role: user.role,
        status: user.status,
        passwordHash: user.passwordHash,
        academyId: user.academyId,
        tokenVersion: user.tokenVersion,
        profilePhotoUrl: user.profilePhotoUrl,
        startDate: user.startDate,
        gender: user.gender,
        whatsappNumber: user.whatsappNumber,
        mobileNumber: user.mobileNumber,
        address: user.address,
        qualificationInfo: user.qualificationInfo,
        salaryConfig: user.salaryConfig,
        version: user.audit.version,
        deletedAt: user.softDelete.deletedAt,
        deletedBy: user.softDelete.deletedBy,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<User | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByEmail(emailNormalized: string): Promise<User | null> {
    const doc = await this.model
      .findOne({ emailNormalized: emailNormalized.toLowerCase() })
      .lean()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByPhone(phoneE164: string): Promise<User | null> {
    const doc = await this.model.findOne({ phoneE164 }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async updateAcademyId(userId: string, academyId: string): Promise<void> {
    await this.model.updateOne({ _id: userId }, { $set: { academyId } }, { session: getTransactionSession() });
  }

  async listByAcademyAndRole(
    academyId: string,
    role: UserRole,
    page: number,
    pageSize: number,
  ): Promise<{ users: User[]; total: number }> {
    const filter = { academyId, role, deletedAt: null };
    const skip = (page - 1) * pageSize;

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const users = docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
    return { users, total };
  }

  async incrementTokenVersionByAcademyId(academyId: string): Promise<string[]> {
    await this.model.updateMany({ academyId, deletedAt: null }, { $inc: { tokenVersion: 1 } }, { session: getTransactionSession() });
    const docs = await this.model.find({ academyId, deletedAt: null }).select('_id').lean().exec();
    return docs.map((d) => String(d._id));
  }

  async listByAcademyId(academyId: string): Promise<User[]> {
    const docs = await this.model.find({ academyId, deletedAt: null }).lean().exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  private toDomain(doc: unknown): User {
    const d = doc as {
      _id: string;
      fullName: string;
      emailNormalized: string;
      phoneE164: string;
      role: string;
      status: string;
      passwordHash: string;
      academyId: string | null;
      tokenVersion: number;
      profilePhotoUrl: string | null;
      startDate: Date | null;
      gender: string | null;
      whatsappNumber: string | null;
      mobileNumber: string | null;
      address: string | null;
      qualificationInfo: { qualification: string | null; position: string | null } | null;
      salaryConfig: { amount: number | null; frequency: string } | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
      deletedAt: Date | null;
      deletedBy: string | null;
    };

    return User.reconstitute(String(d._id), {
      fullName: d.fullName,
      email: Email.create(d.emailNormalized),
      phone: Phone.create(d.phoneE164),
      role: d.role as UserRole,
      status: d.status as UserStatus,
      passwordHash: d.passwordHash,
      academyId: d.academyId ?? null,
      tokenVersion: d.tokenVersion ?? 0,
      profilePhotoUrl: d.profilePhotoUrl ?? null,
      startDate: d.startDate ?? null,
      gender: (d.gender as 'MALE' | 'FEMALE') ?? null,
      whatsappNumber: d.whatsappNumber ?? null,
      mobileNumber: d.mobileNumber ?? null,
      address: d.address ?? null,
      qualificationInfo: d.qualificationInfo as StaffQualificationInfo ?? null,
      salaryConfig: d.salaryConfig
        ? { amount: d.salaryConfig.amount, frequency: d.salaryConfig.frequency as SalaryFrequency }
        : null,
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
