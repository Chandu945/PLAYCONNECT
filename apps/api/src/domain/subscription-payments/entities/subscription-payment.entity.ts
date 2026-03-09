import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';
import type { TierKey } from '@playconnect/contracts';

export type SubscriptionPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface SubscriptionPaymentProps {
  academyId: string;
  ownerUserId: string;
  orderId: string;
  cfOrderId: string | null;
  paymentSessionId: string;
  tierKey: TierKey;
  amountInr: number;
  currency: string;
  activeStudentCountAtPurchase: number;
  status: SubscriptionPaymentStatus;
  failureReason: string | null;
  paidAt: Date | null;
  providerPaymentId: string | null;
  audit: AuditFields;
}

export class SubscriptionPayment extends Entity<SubscriptionPaymentProps> {
  private constructor(id: UniqueId, props: SubscriptionPaymentProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    ownerUserId: string;
    orderId: string;
    paymentSessionId: string;
    tierKey: TierKey;
    amountInr: number;
    activeStudentCountAtPurchase: number;
  }): SubscriptionPayment {
    return new SubscriptionPayment(new UniqueId(params.id), {
      academyId: params.academyId,
      ownerUserId: params.ownerUserId,
      orderId: params.orderId,
      cfOrderId: null,
      paymentSessionId: params.paymentSessionId,
      tierKey: params.tierKey,
      amountInr: params.amountInr,
      currency: 'INR',
      activeStudentCountAtPurchase: params.activeStudentCountAtPurchase,
      status: 'PENDING',
      failureReason: null,
      paidAt: null,
      providerPaymentId: null,
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: SubscriptionPaymentProps): SubscriptionPayment {
    return new SubscriptionPayment(new UniqueId(id), props);
  }

  markSuccess(providerPaymentId: string, paidAt: Date): SubscriptionPayment {
    if (this.props.status !== 'PENDING') {
      throw new Error(`Cannot mark ${this.props.status} subscription payment as SUCCESS`);
    }
    return SubscriptionPayment.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'SUCCESS',
      providerPaymentId,
      paidAt,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markFailed(failureReason: string): SubscriptionPayment {
    if (this.props.status === 'SUCCESS') {
      throw new Error('Cannot mark a SUCCESS subscription payment as FAILED');
    }
    return SubscriptionPayment.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'FAILED',
      failureReason,
      audit: updateAuditFields(this.props.audit),
    });
  }

  setCfOrderId(cfOrderId: string): SubscriptionPayment {
    return SubscriptionPayment.reconstitute(this.id.toString(), {
      ...this.props,
      cfOrderId,
      audit: updateAuditFields(this.props.audit),
    });
  }

  get academyId(): string {
    return this.props.academyId;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get cfOrderId(): string | null {
    return this.props.cfOrderId;
  }
  get paymentSessionId(): string {
    return this.props.paymentSessionId;
  }
  get tierKey(): TierKey {
    return this.props.tierKey;
  }
  get amountInr(): number {
    return this.props.amountInr;
  }
  get currency(): string {
    return this.props.currency;
  }
  get activeStudentCountAtPurchase(): number {
    return this.props.activeStudentCountAtPurchase;
  }
  get status(): SubscriptionPaymentStatus {
    return this.props.status;
  }
  get failureReason(): string | null {
    return this.props.failureReason;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
  }
  get providerPaymentId(): string | null {
    return this.props.providerPaymentId;
  }
  get audit(): AuditFields {
    return this.props.audit;
  }
}
