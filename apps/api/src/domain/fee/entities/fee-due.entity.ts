import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';
import type { FeeDueStatus, PaidSource, PaymentLabel, LateFeeConfig } from '@academyflo/contracts';

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
  lateFeeApplied: number | null;
  lateFeeConfigSnapshot: LateFeeConfig | null;
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
      lateFeeApplied: null,
      lateFeeConfigSnapshot: null,
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

  get lateFeeApplied(): number | null {
    return this.props.lateFeeApplied;
  }

  get lateFeeConfigSnapshot(): LateFeeConfig | null {
    return this.props.lateFeeConfigSnapshot;
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

  markPaid(
    userId: string,
    paidAt: Date,
    paymentLabel: PaymentLabel = 'CASH',
    lateFeeApplied?: number,
  ): FeeDue {
    // PAID is the only terminal, non-payable state. A fee can be collected
    // while UPCOMING (an early / advance payment before its due date) or DUE;
    // computeLateFee returns 0 before the due date, so collecting early
    // correctly applies no late fee. Re-paying a PAID fee is rejected so we
    // never silently overwrite who-paid / how / when — this is the entity-level
    // backstop for the use-case's own already-paid pre-check.
    if (this.props.status === 'PAID') {
      throw new Error('Fee is already paid');
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PAID',
      paidAt,
      paidByUserId: userId,
      paidSource: 'OWNER_DIRECT',
      paymentLabel,
      lateFeeApplied: lateFeeApplied ?? this.props.lateFeeApplied,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markPaidByApproval(params: {
    approvedByUserId: string;
    collectedByUserId: string;
    paymentRequestId: string;
    paidAt: Date;
    paymentLabel?: PaymentLabel;
    lateFeeApplied?: number;
  }): FeeDue {
    // PAID is terminal (see markPaid); UPCOMING/DUE are both collectible.
    if (this.props.status === 'PAID') {
      throw new Error('Fee is already paid');
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
      lateFeeApplied: params.lateFeeApplied ?? this.props.lateFeeApplied,
      audit: updateAuditFields(this.props.audit),
    });
  }

  markPaidByParentOnline(parentUserId: string, paidAt: Date, lateFeeApplied?: number): FeeDue {
    // PAID is terminal (see markPaid); UPCOMING/DUE are both collectible — a
    // parent paying the current month early settles a not-yet-due fee.
    if (this.props.status === 'PAID') {
      throw new Error('Fee is already paid');
    }
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      status: 'PAID',
      paidAt,
      paidByUserId: parentUserId,
      paidSource: 'PARENT_ONLINE',
      paymentLabel: 'ONLINE',
      lateFeeApplied: lateFeeApplied ?? this.props.lateFeeApplied,
      audit: updateAuditFields(this.props.audit),
    });
  }

  snapshotLateFeeConfig(config: LateFeeConfig): FeeDue {
    if (this.props.lateFeeConfigSnapshot) return this; // already snapshotted
    return FeeDue.reconstitute(this.id.toString(), {
      ...this.props,
      lateFeeConfigSnapshot: config,
      audit: updateAuditFields(this.props.audit),
    });
  }

  /**
   * Undo a payment-related state and restore the fee to DUE. Intended for
   * refund/unwind flows that need to fully reset paid-fields.
   *
   * The `lateFeeConfigSnapshot` is intentionally preserved (H1 fix). The
   * snapshot represents "the rate that was locked in when the fee first
   * became DUE" — it predates any payment, so unwinding a payment doesn't
   * invalidate it. Nulling it here would re-expose the fee to the cron's
   * legacy-backfill loop, which would re-snapshot using the current live
   * config and silently retroactively re-price the fee.
   */
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
      lateFeeApplied: null,
      audit: updateAuditFields(this.props.audit),
    });
  }
}
