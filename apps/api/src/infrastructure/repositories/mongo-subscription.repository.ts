import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import { Subscription } from '@domain/subscription/entities/subscription.entity';
import { SubscriptionModel } from '../database/schemas/subscription.schema';
import type { SubscriptionDocument } from '../database/schemas/subscription.schema';
import type { TierKey } from '@playconnect/contracts';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoSubscriptionRepository implements SubscriptionRepository {
  constructor(
    @InjectModel(SubscriptionModel.name) private readonly model: Model<SubscriptionDocument>,
  ) {}

  async save(subscription: Subscription): Promise<void> {
    const isNew = subscription.audit.version === 1;
    const filter: Record<string, unknown> = { _id: subscription.id.toString() };
    if (!isNew) {
      filter['version'] = subscription.audit.version - 1;
    }

    const result = await this.model.findOneAndUpdate(
      filter,
      {
        _id: subscription.id.toString(),
        academyId: subscription.academyId,
        trialStartAt: subscription.trialStartAt,
        trialEndAt: subscription.trialEndAt,
        paidStartAt: subscription.paidStartAt,
        paidEndAt: subscription.paidEndAt,
        tierKey: subscription.tierKey,
        pendingTierKey: subscription.pendingTierKey,
        pendingTierEffectiveAt: subscription.pendingTierEffectiveAt,
        activeStudentCountSnapshot: subscription.activeStudentCountSnapshot,
        manualNotes: subscription.manualNotes,
        paymentReference: subscription.paymentReference,
        version: subscription.audit.version,
      },
      { upsert: isNew, session: getTransactionSession() },
    );

    if (!result && !isNew) {
      throw new Error('Concurrent modification detected for Subscription');
    }
  }

  async findByAcademyId(academyId: string): Promise<Subscription | null> {
    const doc = await this.model.findOne({ academyId }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  private toDomain(doc: unknown): Subscription {
    const d = doc as {
      _id: string;
      academyId: string;
      trialStartAt: Date;
      trialEndAt: Date;
      paidStartAt: Date | null;
      paidEndAt: Date | null;
      tierKey: string | null;
      pendingTierKey: string | null;
      pendingTierEffectiveAt: Date | null;
      activeStudentCountSnapshot: number | null;
      manualNotes: string | null;
      paymentReference: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    return Subscription.reconstitute(String(d._id), {
      academyId: d.academyId,
      trialStartAt: d.trialStartAt,
      trialEndAt: d.trialEndAt,
      paidStartAt: d.paidStartAt,
      paidEndAt: d.paidEndAt,
      tierKey: d.tierKey as TierKey | null,
      pendingTierKey: (d.pendingTierKey as TierKey | null) ?? null,
      pendingTierEffectiveAt: d.pendingTierEffectiveAt ?? null,
      activeStudentCountSnapshot: d.activeStudentCountSnapshot ?? null,
      manualNotes: d.manualNotes,
      paymentReference: d.paymentReference ?? null,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
