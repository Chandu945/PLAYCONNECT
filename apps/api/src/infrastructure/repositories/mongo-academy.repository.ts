import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { Academy } from '@domain/academy/entities/academy.entity';
import type { Address, InstituteInfo } from '@domain/academy/entities/academy.entity';
import { AcademyModel } from '../database/schemas/academy.schema';
import type { AcademyDocument } from '../database/schemas/academy.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoAcademyRepository implements AcademyRepository {
  constructor(@InjectModel(AcademyModel.name) private readonly model: Model<AcademyDocument>) {}

  async save(academy: Academy): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: academy.id.toString() },
      {
        _id: academy.id.toString(),
        ownerUserId: academy.ownerUserId,
        academyName: academy.academyName,
        address: academy.address,
        loginDisabled: academy.loginDisabled,
        deactivatedAt: academy.deactivatedAt,
        defaultDueDateDay: academy.defaultDueDateDay,
        receiptPrefix: academy.receiptPrefix,
        instituteInfo: academy.instituteInfo,
        version: academy.audit.version,
        deletedAt: academy.softDelete.deletedAt,
        deletedBy: academy.softDelete.deletedBy,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<Academy | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<Academy | null> {
    const doc = await this.model.findOne({ ownerUserId }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findAllIds(): Promise<string[]> {
    const docs = await this.model.find({ deletedAt: null }, { _id: 1 }).lean().exec();
    return docs.map((d) => String(d._id));
  }

  private toDomain(doc: unknown): Academy {
    const d = doc as {
      _id: string;
      ownerUserId: string;
      academyName: string;
      address: Address;
      loginDisabled: boolean;
      deactivatedAt: Date | null;
      defaultDueDateDay: number | null;
      receiptPrefix: string | null;
      instituteInfo: InstituteInfo | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
      deletedAt: Date | null;
      deletedBy: string | null;
    };

    return Academy.reconstitute(String(d._id), {
      ownerUserId: d.ownerUserId,
      academyName: d.academyName,
      address: d.address,
      loginDisabled: d.loginDisabled ?? false,
      deactivatedAt: d.deactivatedAt ?? null,
      defaultDueDateDay: d.defaultDueDateDay ?? null,
      receiptPrefix: d.receiptPrefix ?? null,
      instituteInfo: d.instituteInfo ?? undefined,
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
