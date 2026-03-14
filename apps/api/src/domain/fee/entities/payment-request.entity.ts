import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';
import type { PaymentRequestStatus } from '@playconnect/contracts';

export interface PaymentRequestProps {
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
  audit: AuditFields;
}

export class PaymentRequest extends Entity<PaymentRequestProps> {
  private constructor(id: UniqueId, props: PaymentRequestProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    studentId: string;
    feeDueId: string;
    monthKey: string;
    amount: number;
    staffUserId: string;
    staffNotes: string;
  }): PaymentRequest {
    return new PaymentRequest(new UniqueId(params.id), {
      academyId: params.academyId,
      studentId: params.studentId,
      feeDueId: params.feeDueId,
      monthKey: params.monthKey,
      amount: params.amount,
      staffUserId: params.staffUserId,
      staffNotes: params.staffNotes,
      status: 'PENDING',
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: PaymentRequestProps): PaymentRequest {
    return new PaymentRequest(new UniqueId(id), props);
  }

  get academyId(): string {
    return this.props.academyId;
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

  get amount(): number {
    return this.props.amount;
  }

  get staffUserId(): string {
    return this.props.staffUserId;
  }

  get staffNotes(): string {
    return this.props.staffNotes;
  }

  get status(): PaymentRequestStatus {
    return this.props.status;
  }

  get reviewedByUserId(): string | null {
    return this.props.reviewedByUserId;
  }

  get reviewedAt(): Date | null {
    return this.props.reviewedAt;
  }

  get rejectionReason(): string | null {
    return this.props.rejectionReason;
  }

  get audit(): AuditFields {
    return this.props.audit;
  }

  approve(reviewerId: string, reviewedAt: Date): PaymentRequest {
    return PaymentRequest.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'APPROVED',
      reviewedByUserId: reviewerId,
      reviewedAt,
      audit: updateAuditFields(this.props.audit),
    });
  }

  reject(reviewerId: string, reviewedAt: Date, reason: string): PaymentRequest {
    return PaymentRequest.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'REJECTED',
      reviewedByUserId: reviewerId,
      reviewedAt,
      rejectionReason: reason,
      audit: updateAuditFields(this.props.audit),
    });
  }

  cancel(): PaymentRequest {
    return PaymentRequest.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'CANCELLED',
      audit: updateAuditFields(this.props.audit),
    });
  }

  updateNotes(notes: string): PaymentRequest {
    return PaymentRequest.reconstitute(this.id.toString(), {
      ...this.props,
      staffNotes: notes,
      audit: updateAuditFields(this.props.audit),
    });
  }

  /** Allow staff to resubmit a previously rejected request with updated notes/amount */
  resubmit(notes: string, amount?: number): PaymentRequest {
    return PaymentRequest.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PENDING',
      staffNotes: notes,
      amount: amount ?? this.props.amount,
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      audit: updateAuditFields(this.props.audit),
    });
  }
}
