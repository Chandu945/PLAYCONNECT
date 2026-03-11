import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { FeePaymentRepository } from '@domain/parent/ports/fee-payment.repository';
import { FeePayment } from '@domain/parent/entities/fee-payment.entity';
import type { FeePaymentStatus } from '@domain/parent/entities/fee-payment.entity';
import { FeePaymentModel } from '../database/schemas/fee-payment.schema';
import type { FeePaymentDocument } from '../database/schemas/fee-payment.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoFeePaymentRepository implements FeePaymentRepository {
  constructor(
    @InjectModel(FeePaymentModel.name)
    private readonly model: Model<FeePaymentDocument>,
  ) {}

  async save(payment: FeePayment): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: payment.id.toString() },
      {
        _id: payment.id.toString(),
        academyId: payment.academyId,
        parentUserId: payment.parentUserId,
        studentId: payment.studentId,
        feeDueId: payment.feeDueId,
        monthKey: payment.monthKey,
        orderId: payment.orderId,
        cfOrderId: payment.cfOrderId,
        paymentSessionId: payment.paymentSessionId,
        baseAmount: payment.baseAmount,
        convenienceFee: payment.convenienceFee,
        totalAmount: payment.totalAmount,
        currency: payment.currency,
        status: payment.status,
        failureReason: payment.failureReason,
        paidAt: payment.paidAt,
        providerPaymentId: payment.providerPaymentId,
        version: payment.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async saveWithStatusPrecondition(
    payment: FeePayment,
    expectedStatus: string,
  ): Promise<boolean> {
    const result = await this.model.findOneAndUpdate(
      { _id: payment.id.toString(), status: expectedStatus },
      {
        academyId: payment.academyId,
        parentUserId: payment.parentUserId,
        studentId: payment.studentId,
        feeDueId: payment.feeDueId,
        monthKey: payment.monthKey,
        orderId: payment.orderId,
        cfOrderId: payment.cfOrderId,
        paymentSessionId: payment.paymentSessionId,
        baseAmount: payment.baseAmount,
        convenienceFee: payment.convenienceFee,
        totalAmount: payment.totalAmount,
        currency: payment.currency,
        status: payment.status,
        failureReason: payment.failureReason,
        paidAt: payment.paidAt,
        providerPaymentId: payment.providerPaymentId,
        version: payment.audit.version,
      },
      { session: getTransactionSession() },
    );
    return result !== null;
  }

  async findByOrderId(orderId: string): Promise<FeePayment | null> {
    const doc = await this.model.findOne({ orderId }).lean().exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findPendingByFeeDueId(feeDueId: string): Promise<FeePayment | null> {
    const doc = await this.model
      .findOne({ feeDueId, status: 'PENDING' })
      .lean()
      .exec();
    return doc ? this.toDomain(doc as unknown as Record<string, unknown>) : null;
  }

  async findByParentAndAcademy(
    parentUserId: string,
    academyId: string,
  ): Promise<FeePayment[]> {
    const docs = await this.model
      .find({ parentUserId, academyId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as unknown as Record<string, unknown>));
  }

  private toDomain(doc: unknown): FeePayment {
    const d = doc as {
      _id: string;
      academyId: string;
      parentUserId: string;
      studentId: string;
      feeDueId: string;
      monthKey: string;
      orderId: string;
      cfOrderId: string | null;
      paymentSessionId: string;
      baseAmount: number;
      convenienceFee: number;
      totalAmount: number;
      currency: string;
      status: string;
      failureReason: string | null;
      paidAt: Date | null;
      providerPaymentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return FeePayment.reconstitute(String(d._id), {
      academyId: d.academyId,
      parentUserId: d.parentUserId,
      studentId: d.studentId,
      feeDueId: d.feeDueId,
      monthKey: d.monthKey,
      orderId: d.orderId,
      cfOrderId: d.cfOrderId,
      paymentSessionId: d.paymentSessionId,
      baseAmount: d.baseAmount,
      convenienceFee: d.convenienceFee ?? 0,
      totalAmount: d.totalAmount ?? d.baseAmount,
      currency: d.currency,
      status: d.status as FeePaymentStatus,
      failureReason: d.failureReason,
      paidAt: d.paidAt,
      providerPaymentId: d.providerPaymentId,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
