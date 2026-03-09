import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';
import { StudentBatchModel } from '../database/schemas/student-batch.schema';
import type { StudentBatchDocument } from '../database/schemas/student-batch.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoStudentBatchRepository implements StudentBatchRepository {
  constructor(
    @InjectModel(StudentBatchModel.name) private readonly model: Model<StudentBatchDocument>,
  ) {}

  async replaceForStudent(studentId: string, assignments: StudentBatch[]): Promise<void> {
    const session = getTransactionSession();
    await this.model.deleteMany({ studentId }, { session }).exec();

    if (assignments.length > 0) {
      const docs = assignments.map((a) => ({
        _id: a.id.toString(),
        studentId: a.studentId,
        batchId: a.batchId,
        academyId: a.academyId,
        assignedAt: a.assignedAt,
      }));
      await this.model.insertMany(docs, { session });
    }
  }

  async findByStudentId(studentId: string): Promise<StudentBatch[]> {
    const docs = await this.model.find({ studentId }).lean().exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async findByBatchId(batchId: string): Promise<StudentBatch[]> {
    const docs = await this.model.find({ batchId }).lean().exec();
    return docs.map((doc) => this.toDomain(doc as unknown as Record<string, unknown>));
  }

  async deleteByBatchId(batchId: string): Promise<number> {
    const result = await this.model.deleteMany({ batchId }, { session: getTransactionSession() }).exec();
    return result.deletedCount;
  }

  async countByBatchId(batchId: string): Promise<number> {
    return this.model.countDocuments({ batchId }).exec();
  }

  private toDomain(doc: Record<string, unknown>): StudentBatch {
    const d = doc as {
      _id: string;
      studentId: string;
      batchId: string;
      academyId: string;
      assignedAt: Date;
    };

    return StudentBatch.reconstitute(String(d._id), {
      studentId: d.studentId,
      batchId: d.batchId,
      academyId: d.academyId,
      assignedAt: d.assignedAt,
    });
  }
}
