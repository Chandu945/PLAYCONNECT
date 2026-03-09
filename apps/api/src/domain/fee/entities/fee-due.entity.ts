import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';
import type { FeeDueStatus, PaidSource, PaymentLabel } from '@playconnect/contracts';

export interface FeeDueProps {
  academyId: string;
  studentId: string;
  monthKey: string;
  dueDate: string;
  amount: number;
  status: FeeDueStatus;
  paidAt: Date | null;
  paidByUserId: string | null;
  paidSource: PaidSource | null;
  paymentLabel: PaymentLabel | null;
  collectedByUserId: string | null;
  approvedByUserId: string | null;
  paymentRequestId: string | null;
  audit: AuditFields;
}

export class FeeDue extends Entity<FeeDueProps> {
  private constructor(id: UniqueId, props: FeeDueProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    studentId: string;
    monthKey: string;
    dueDate: string;
    amount: number;
  }): FeeDue {
    return new FeeDue(new UniqueId(params.id), {
      academyId: params.academyId,
      studentId: params.studentId,
      monthKey: params.monthKey,
      dueDate: params.dueDate,
      amount: params.amount,
      status: 'UPCOMING',
      paidAt: null,
      paidByUserId: null,
      paidSource: null,
      paymentLabel: null,
      collectedByUserId: null,
      approvedByUserId: null,
      paymentRequestId: null,
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: FeeDueProps): FeeDue {
    return new FeeDue(new UniqueId(id), props);
  }

  get academyId(): string {
    return this.props.academyId;
  }

  get studentId(): string {
    return this.props.studentId;
  }

  get monthKey(): string {
    return this.props.monthKey;
  }

  get dueDate(): string {
    return this.props.dueDate;
  }

  get amount(): number {
    return this.props.amount;
  }

  get status(): FeeDueStatus {
    return this.props.status;
  }

  get paidAt(): Date | null {
    return this.props.paidAt;
  }

  get paidByUserId(): string | null {
    return this.props.paidByUserId;
  }

  get paidSource(): PaidSource | null {
    return this.props.paidSource;
  }

  get paymentLabel(): PaymentLabel | null {
    return this.props.paymentLabel;
  }

  get collectedByUserId(): string | null {
    return this.props.collectedByUserId;
  }

  get approvedByUserId(): string | null {
    return this.props.approvedByUserId;
  }

  get paymentRequestId(): string | null {
    return this.props.paymentRequestId;
  }

  get audit(): AuditFields {
    return this.props.audit;
  }

  flipToDue(): FeeDue {
    if (this.props.status !== 'UPCOMING') {
      return this;
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'DUE',
      audit: updateAuditFields(this.props.audit),
    });
  }

  markPaid(userId: string, paidAt: Date, paymentLabel: PaymentLabel = 'CASH'): FeeDue {
    if (this.props.status === 'UPCOMING') {
      throw new Error('Cannot mark an UPCOMING fee as paid');
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PAID',
      paidAt,
      paidByUserId: userId,
      paidSource: 'OWNER_DIRECT',
      paymentLabel,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markPaidByApproval(params: {
    approvedByUserId: string;
    collectedByUserId: string;
    paymentRequestId: string;
    paidAt: Date;
    paymentLabel?: PaymentLabel;
  }): FeeDue {
    if (this.props.status === 'UPCOMING') {
      throw new Error('Cannot mark an UPCOMING fee as paid');
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PAID',
      paidAt: params.paidAt,
      paidByUserId: params.collectedByUserId,
      paidSource: 'STAFF_APPROVED',
      paymentLabel: params.paymentLabel ?? 'CASH',
      collectedByUserId: params.collectedByUserId,
      approvedByUserId: params.approvedByUserId,
      paymentRequestId: params.paymentRequestId,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markPaidByParentOnline(parentUserId: string, paidAt: Date): FeeDue {
    if (this.props.status === 'UPCOMING') {
      throw new Error('Cannot mark an UPCOMING fee as paid');
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PAID',
      paidAt,
      paidByUserId: parentUserId,
      paidSource: 'PARENT_ONLINE',
      paymentLabel: 'ONLINE',
      audit: updateAuditFields(this.props.audit),
    });
  }

  revertToDue(): FeeDue {
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'DUE',
      paidAt: null,
      paidByUserId: null,
      paidSource: null,
      paymentLabel: null,
      collectedByUserId: null,
      approvedByUserId: null,
      paymentRequestId: null,
      audit: updateAuditFields(this.props.audit),
    });
  }
}
