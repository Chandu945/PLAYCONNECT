import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import { ParentStudentLink } from '@domain/parent/entities/parent-student-link.entity';
import { ParentStudentLinkModel } from '../database/schemas/parent-student-link.schema';
import type { ParentStudentLinkDocument } from '../database/schemas/parent-student-link.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoParentStudentLinkRepository implements ParentStudentLinkRepository {
  constructor(
    @InjectModel(ParentStudentLinkModel.name)
    private readonly model: Model<ParentStudentLinkDocument>,
  ) {}

  async save(link: ParentStudentLink): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: link.id.toString() },
      {
        _id: link.id.toString(),
        parentUserId: link.parentUserId,
        studentId: link.studentId,
        academyId: link.academyId,
        version: link.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findByParentAndStudent(
    parentUserId: string,
    studentId: string,
  ): Promise<ParentStudentLink | null> {
    const doc = await this.model.findOne({ parentUserId, studentId }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findByParentUserId(parentUserId: string): Promise<ParentStudentLink[]> {
    const docs = await this.model.find({ parentUserId }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findByStudentId(studentId: string): Promise<ParentStudentLink[]> {
    const docs = await this.model.find({ studentId }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async findByAcademyId(academyId: string): Promise<ParentStudentLink[]> {
    const docs = await this.model.find({ academyId }).lean().exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async deleteByParentAndStudent(parentUserId: string, studentId: string): Promise<void> {
    await this.model.deleteOne({ parentUserId, studentId }, { session: getTransactionSession() });
  }

  private toDomain(doc: Record<string, unknown>): ParentStudentLink {
    const d = doc as {
      _id: string;
      parentUserId: string;
      studentId: string;
      academyId: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return ParentStudentLink.reconstitute(String(d._id), {
      parentUserId: d.parentUserId,
      studentId: d.studentId,
      academyId: d.academyId,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
