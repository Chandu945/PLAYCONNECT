import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import { Batch } from '@domain/batch/entities/batch.entity';
import { BatchModel } from '../database/schemas/batch.schema';
import type { BatchDocument } from '../database/schemas/batch.schema';
import type { Weekday } from '@playconnect/contracts';
import type { BatchStatus } from '@domain/batch/entities/batch.entity';
import { getTransactionSession } from '../database/transaction-context';
import { escapeRegex } from '@shared/utils/escape-regex';

@Injectable()
export class MongoBatchRepository implements BatchRepository {
  constructor(@InjectModel(BatchModel.name) private readonly model: Model<BatchDocument>) {}

  async save(batch: Batch): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: batch.id.toString() },
      {
        _id: batch.id.toString(),
        academyId: batch.academyId,
        batchName: batch.batchName,
        batchNameNormalized: batch.batchNameNormalized,
        days: batch.days,
        notes: batch.notes,
        profilePhotoUrl: batch.profilePhotoUrl,
        status: batch.status,
        version: batch.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }, { session: getTransactionSession() }).exec();
  }

  async findById(id: string): Promise<Batch | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findByAcademyAndName(
    academyId: string,
    batchNameNormalized: string,
  ): Promise<Batch | null> {
    const doc = await this.model.findOne({ academyId, batchNameNormalized }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademy(
    academyId: string,
    page: number,
    pageSize: number,
    search?: string,
  ): Promise<{ batches: Batch[]; total: number }> {
    const filter: Record<string, unknown> = { academyId };
    if (search) {
      const normalizedSearch = search.trim().toLowerCase();
      filter['batchNameNormalized'] = { $regex: `^${escapeRegex(normalizedSearch)}` };
    }
    const skip = (page - 1) * pageSize;

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const batches = docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
    return { batches, total };
  }

  private toDomain(doc: unknown): Batch {
    const d = doc as {
      _id: string;
      academyId: string;
      batchName: string;
      batchNameNormalized: string;
      days: string[];
      notes: string | null;
      profilePhotoUrl: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return Batch.reconstitute(String(d._id), {
      academyId: d.academyId,
      batchName: d.batchName,
      batchNameNormalized: d.batchNameNormalized,
      days: (d.days ?? []) as Weekday[],
      notes: d.notes,
      profilePhotoUrl: d.profilePhotoUrl ?? null,
      status: (d.status as BatchStatus) ?? 'ACTIVE',
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
