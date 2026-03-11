import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ExpenseRepository } from '@domain/expense/ports/expense.repository';
import { Expense } from '@domain/expense/entities/expense.entity';
import { ExpenseModel } from '../database/schemas/expense.schema';
import type { ExpenseDocument } from '../database/schemas/expense.schema';
import { formatLocalDate } from '@shared/date-utils';
import { getTransactionSession } from '../database/transaction-context';
import { escapeRegex } from '@shared/utils/escape-regex';

@Injectable()
export class MongoExpenseRepository implements ExpenseRepository {
  constructor(@InjectModel(ExpenseModel.name) private readonly model: Model<ExpenseDocument>) {}

  async save(expense: Expense): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: expense.id.toString() },
      {
        _id: expense.id.toString(),
        academyId: expense.academyId,
        date: expense.date,
        categoryId: expense.categoryId,
        category: expense.categoryName,
        amount: expense.amount,
        notes: expense.notes,
        createdBy: expense.createdBy,
        deletedAt: expense.softDelete.deletedAt,
        deletedBy: expense.softDelete.deletedBy,
        version: expense.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<Expense | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademy(
    academyId: string,
    filter: {
      month: string;
      categoryId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ data: Expense[]; total: number }> {
    const query: Record<string, unknown> = {
      academyId,
      deletedAt: null,
      date: { $regex: `^${escapeRegex(filter.month)}` },
    };
    if (filter.categoryId) {
      query['categoryId'] = filter.categoryId;
    }

    const skip = (filter.page - 1) * filter.pageSize;

    const [docs, total] = await Promise.all([
      this.model.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(filter.pageSize).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return {
      data: docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>)),
      total,
    };
  }

  async sumByAcademyAndMonth(academyId: string, month: string): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          academyId,
          deletedAt: null,
          date: { $regex: `^${escapeRegex(month)}` },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  }

  async sumByAcademyAndDateRange(academyId: string, from: Date, to: Date): Promise<number> {
    const fromStr = formatLocalDate(from);
    const toStr = formatLocalDate(to);
    const result = await this.model.aggregate([
      {
        $match: {
          academyId,
          deletedAt: null,
          date: { $gte: fromStr, $lte: toStr },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  }

  async summarizeByCategory(
    academyId: string,
    month: string,
  ): Promise<{ category: string; total: number }[]> {
    return this.model.aggregate([
      {
        $match: {
          academyId,
          deletedAt: null,
          date: { $regex: `^${escapeRegex(month)}` },
        },
      },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $project: { _id: 0, category: '$_id', total: 1 } },
      { $sort: { total: -1 } },
    ]);
  }

  async countByCategoryId(academyId: string, categoryId: string): Promise<number> {
    return this.model.countDocuments({ academyId, categoryId, deletedAt: null });
  }

  async sumByAcademyGroupedByMonth(
    academyId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<{ month: string; total: number }[]> {
    // date is stored as YYYY-MM-DD string, so substr(0,7) gives YYYY-MM
    const result = await this.model.aggregate([
      {
        $match: {
          academyId,
          deletedAt: null,
          date: { $gte: fromMonth, $lte: toMonth + '-31' },
        },
      },
      {
        $group: {
          _id: { $substr: ['$date', 0, 7] },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return result.map((r: { _id: string; total: number }) => ({
      month: r._id,
      total: r.total,
    }));
  }

  private toDomain(doc: unknown): Expense {
    const d = doc as {
      _id: string;
      academyId: string;
      date: string;
      categoryId: string | null;
      category: string;
      amount: number;
      notes: string | null;
      createdBy: string;
      deletedAt: Date | null;
      deletedBy: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return Expense.reconstitute(String(d._id), {
      academyId: d.academyId,
      date: d.date,
      categoryId: d.categoryId ?? '',
      categoryName: d.category,
      amount: d.amount,
      notes: d.notes,
      createdBy: d.createdBy,
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
