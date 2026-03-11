import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { SubscriptionPaymentRepository } from '@domain/subscription-payments/ports/subscription-payment.repository';
import { SubscriptionPayment } from '@domain/subscription-payments/entities/subscription-payment.entity';
import type { SubscriptionPaymentStatus } from '@domain/subscription-payments/entities/subscription-payment.entity';
import { SubscriptionPaymentModel } from '../database/schemas/subscription-payment.schema';
import type { SubscriptionPaymentDocument } from '../database/schemas/subscription-payment.schema';
import type { TierKey } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoSubscriptionPaymentRepository implements SubscriptionPaymentRepository {
  constructor(
    @InjectModel(SubscriptionPaymentModel.name)
    private readonly model: Model<SubscriptionPaymentDocument>,
  ) {}

  async save(payment: SubscriptionPayment): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: payment.id.toString() },
      {
        _id: payment.id.toString(),
        academyId: payment.academyId,
        ownerUserId: payment.ownerUserId,
        orderId: payment.orderId,
        cfOrderId: payment.cfOrderId,
        paymentSessionId: payment.paymentSessionId,
        tierKey: payment.tierKey,
        amountInr: payment.amountInr,
        currency: payment.currency,
        activeStudentCountAtPurchase: payment.activeStudentCountAtPurchase,
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
    payment: SubscriptionPayment,
    expectedStatus: string,
  ): Promise<boolean> {
    const result = await this.model.findOneAndUpdate(
      { _id: payment.id.toString(), status: expectedStatus },
      {
        academyId: payment.academyId,
        ownerUserId: payment.ownerUserId,
        orderId: payment.orderId,
        cfOrderId: payment.cfOrderId,
        paymentSessionId: payment.paymentSessionId,
        tierKey: payment.tierKey,
        amountInr: payment.amountInr,
        currency: payment.currency,
        activeStudentCountAtPurchase: payment.activeStudentCountAtPurchase,
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

  async findByOrderId(orderId: string): Promise<SubscriptionPayment | null> {
    const doc = await this.model.findOne({ orderId }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findPendingByAcademyId(academyId: string): Promise<SubscriptionPayment | null> {
    const doc = await this.model
      .findOne({ academyId, status: 'PENDING' })
      .lean()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  private toDomain(doc: unknown): SubscriptionPayment {
    const d = doc as {
      _id: string;
      academyId: string;
      ownerUserId: string;
      orderId: string;
      cfOrderId: string | null;
      paymentSessionId: string;
      tierKey: string;
      amountInr: number;
      currency: string;
      activeStudentCountAtPurchase: number;
      status: string;
      failureReason: string | null;
      paidAt: Date | null;
      providerPaymentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return SubscriptionPayment.reconstitute(String(d._id), {
      academyId: d.academyId,
      ownerUserId: d.ownerUserId,
      orderId: d.orderId,
      cfOrderId: d.cfOrderId,
      paymentSessionId: d.paymentSessionId,
      tierKey: d.tierKey as TierKey,
      amountInr: d.amountInr,
      currency: d.currency,
      activeStudentCountAtPurchase: d.activeStudentCountAtPurchase,
      status: d.status as SubscriptionPaymentStatus,
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
