import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ExpenseCategoryRepository } from '@domain/expense/ports/expense-category.repository';
import { ExpenseCategory } from '@domain/expense/entities/expense-category.entity';
import { ExpenseCategoryModel } from '../database/schemas/expense-category.schema';
import type { ExpenseCategoryDocument } from '../database/schemas/expense-category.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoExpenseCategoryRepository implements ExpenseCategoryRepository {
  constructor(
    @InjectModel(ExpenseCategoryModel.name)
    private readonly model: Model<ExpenseCategoryDocument>,
  ) {}

  async save(category: ExpenseCategory): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: category.id.toString() },
      {
        _id: category.id.toString(),
        academyId: category.academyId,
        name: category.name,
        createdBy: category.createdBy,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<ExpenseCategory | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findByAcademyAndName(academyId: string, name: string): Promise<ExpenseCategory | null> {
    const doc = await this.model
      .findOne({ academyId, name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } })
      .lean()
      .exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademy(academyId: string): Promise<ExpenseCategory[]> {
    const docs = await this.model.find({ academyId }).sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async deleteById(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }, { session: getTransactionSession() });
  }

  private toDomain(doc: Record<string, unknown>): ExpenseCategory {
    const d = doc as {
      _id: string;
      academyId: string;
      name: string;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    };

    return ExpenseCategory.reconstitute(String(d._id), {
      academyId: d.academyId,
      name: d.name,
      createdBy: d.createdBy,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: 1,
      },
    });
  }
}
