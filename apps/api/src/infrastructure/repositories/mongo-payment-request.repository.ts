import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import { PaymentRequest } from '@domain/fee/entities/payment-request.entity';
import { PaymentRequestModel } from '../database/schemas/payment-request.schema';
import type { PaymentRequestDocument } from '../database/schemas/payment-request.schema';
import type { PaymentRequestStatus } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoPaymentRequestRepository implements PaymentRequestRepository {
  constructor(
    @InjectModel(PaymentRequestModel.name)
    private readonly model: Model<PaymentRequestDocument>,
  ) {}

  async save(request: PaymentRequest): Promise<void> {
    const isNew = request.audit.version === 1;
    const filter: Record<string, unknown> = { _id: request.id.toString() };
    if (!isNew) {
      filter['version'] = request.audit.version - 1;
    }

    const result = await this.model.findOneAndUpdate(
      filter,
      {
        _id: request.id.toString(),
        academyId: request.academyId,
        studentId: request.studentId,
        feeDueId: request.feeDueId,
        monthKey: request.monthKey,
        amount: request.amount,
        staffUserId: request.staffUserId,
        staffNotes: request.staffNotes,
        status: request.status,
        reviewedByUserId: request.reviewedByUserId,
        reviewedAt: request.reviewedAt,
        rejectionReason: request.rejectionReason,
        version: request.audit.version,
      },
      { upsert: isNew, session: getTransactionSession() },
    );

    if (!result && !isNew) {
      throw new Error('Concurrent modification detected for PaymentRequest');
    }
  }

  async findById(id: string): Promise<PaymentRequest | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findPendingByFeeDue(feeDueId: string): Promise<PaymentRequest | null> {
    const doc = await this.model.findOne({ feeDueId, status: 'PENDING' }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async listByAcademyAndStatuses(
    academyId: string,
    statuses: PaymentRequestStatus[],
  ): Promise<PaymentRequest[]> {
    const docs = await this.model
      .find({ academyId, status: { $in: statuses } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async listByStaffAndAcademy(staffUserId: string, academyId: string): Promise<PaymentRequest[]> {
    const docs = await this.model
      .find({ staffUserId, academyId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  async countPendingByAcademy(academyId: string): Promise<number> {
    return this.model.countDocuments({ academyId, status: 'PENDING' });
  }

  private toDomain(doc: unknown): PaymentRequest {
    const d = doc as {
      _id: string;
      academyId: string;
      studentId: string;
      feeDueId: string;
      monthKey: string;
      amount: number;
      staffUserId: string;
      staffNotes: string;
      status: PaymentRequestStatus;
      reviewedByUserId: string | null;
      reviewedAt: Date | null;
      rejectionReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return PaymentRequest.reconstitute(String(d._id), {
      academyId: d.academyId,
      studentId: d.studentId,
      feeDueId: d.feeDueId,
      monthKey: d.monthKey,
      amount: d.amount,
      staffUserId: d.staffUserId,
      staffNotes: d.staffNotes,
      status: d.status,
      reviewedByUserId: d.reviewedByUserId ?? null,
      reviewedAt: d.reviewedAt ?? null,
      rejectionReason: d.rejectionReason ?? null,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
