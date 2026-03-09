import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import { Holiday } from '@domain/attendance/entities/holiday.entity';
import { HolidayModel } from '../database/schemas/holiday.schema';
import type { HolidayDocument } from '../database/schemas/holiday.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoHolidayRepository implements HolidayRepository {
  constructor(
    @InjectModel(HolidayModel.name)
    private readonly model: Model<HolidayDocument>,
  ) {}

  async save(holiday: Holiday): Promise<void> {
    await this.model.findOneAndUpdate(
      { academyId: holiday.academyId, date: holiday.date },
      {
        _id: holiday.id.toString(),
        academyId: holiday.academyId,
        date: holiday.date,
        reason: holiday.reason,
        declaredByUserId: holiday.declaredByUserId,
        version: holiday.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findByAcademyAndDate(academyId: string, date: string): Promise<Holiday | null> {
    const doc = await this.model.findOne({ academyId, date }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async deleteByAcademyAndDate(academyId: string, date: string): Promise<void> {
    await this.model.deleteOne({ academyId, date }, { session: getTransactionSession() });
  }

  async findByAcademyAndMonth(academyId: string, monthPrefix: string): Promise<Holiday[]> {
    const docs = await this.model
      .find({
        academyId,
        date: { $regex: `^${monthPrefix}` },
      })
      .lean()
      .exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  private toDomain(doc: Record<string, unknown>): Holiday {
    const d = doc as {
      _id: string;
      academyId: string;
      date: string;
      reason: string | null;
      declaredByUserId: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return Holiday.reconstitute(String(d._id), {
      academyId: d.academyId,
      date: d.date,
      reason: d.reason,
      declaredByUserId: d.declaredByUserId,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
