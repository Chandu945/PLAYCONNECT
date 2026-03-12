import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';

export type FeePaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface FeePaymentProps {
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
  lateFeeSnapshot: number;
  currency: string;
  status: FeePaymentStatus;
  failureReason: string | null;
  paidAt: Date | null;
  providerPaymentId: string | null;
  audit: AuditFields;
}

export class FeePayment extends Entity<FeePaymentProps> {
  private constructor(id: UniqueId, props: FeePaymentProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    parentUserId: string;
    studentId: string;
    feeDueId: string;
    monthKey: string;
    orderId: string;
    paymentSessionId: string;
    baseAmount: number;
    convenienceFee: number;
    totalAmount: number;
    lateFeeSnapshot?: number;
  }): FeePayment {
    return new FeePayment(new UniqueId(params.id), {
      academyId: params.academyId,
      parentUserId: params.parentUserId,
      studentId: params.studentId,
      feeDueId: params.feeDueId,
      monthKey: params.monthKey,
      orderId: params.orderId,
      cfOrderId: null,
      paymentSessionId: params.paymentSessionId,
      baseAmount: params.baseAmount,
      convenienceFee: params.convenienceFee,
      totalAmount: params.totalAmount,
      lateFeeSnapshot: params.lateFeeSnapshot ?? 0,
      currency: 'INR',
      status: 'PENDING',
      failureReason: null,
      paidAt: null,
      providerPaymentId: null,
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: FeePaymentProps): FeePayment {
    return new FeePayment(new UniqueId(id), props);
  }

  markSuccess(providerPaymentId: string, paidAt: Date): FeePayment {
    if (this.props.status !== 'PENDING') {
      throw new Error(`Cannot mark ${this.props.status} fee payment as SUCCESS`);
    }
    return FeePayment.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'SUCCESS',
      providerPaymentId,
      paidAt,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markFailed(failureReason: string): FeePayment {
    if (this.props.status === 'SUCCESS') {
      throw new Error('Cannot mark a SUCCESS fee payment as FAILED');
    }
    return FeePayment.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'FAILED',
      failureReason,
      audit: updateAuditFields(this.props.audit),
    });
  }

  setCfOrderId(cfOrderId: string): FeePayment {
    return FeePayment.reconstitute(this.id.toString(), {
      ...this.props,
      cfOrderId,
      audit: updateAuditFields(this.props.audit),
    });
  }

  get academyId(): string {
    return this.props.academyId;
  }
  get parentUserId(): string {
    return this.props.parentUserId;
  }
  get studentId(): string {
    return this.props.studentId;
  }
  get feeDueId(): string {
    return this.props.feeDueId;
  }
  get monthKey(): string {
    return this.props.monthKey;
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
  get baseAmount(): number {
    return this.props.baseAmount;
  }
  get convenienceFee(): number {
    return this.props.convenienceFee;
  }
  get totalAmount(): number {
    return this.props.totalAmount;
  }
  get lateFeeSnapshot(): number {
    return this.props.lateFeeSnapshot;
  }
  get currency(): string {
    return this.props.currency;
  }
  get status(): FeePaymentStatus {
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
