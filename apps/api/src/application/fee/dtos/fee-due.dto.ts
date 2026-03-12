import type { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { FeeDueStatus, PaidSource, PaymentLabel, LateFeeConfig } from '@playconnect/contracts';
import { computeLateFee } from '@playconnect/contracts';

export interface FeeDueDto {
  id: string;
  academyId: string;
  studentId: string;
  monthKey: string;
  dueDate: string;
  amount: number;
  lateFee: number;
  totalPayable: number;
  status: FeeDueStatus;
  paidAt: string | null;
  paidByUserId: string | null;
  paidSource: PaidSource | null;
  paymentLabel: PaymentLabel | null;
  collectedByUserId: string | null;
  approvedByUserId: string | null;
  paymentRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toFeeDueDto(
  feeDue: FeeDue,
  lateFeeConfig?: LateFeeConfig,
  today?: string,
): FeeDueDto {
  let lateFee = 0;
  if (feeDue.status === 'PAID') {
    // For paid fees, use the snapshotted amount that was actually collected
    lateFee = feeDue.lateFeeApplied ?? 0;
  } else if (today) {
    // For unpaid fees, compute dynamically — prefer snapshot config over live config
    const effectiveConfig = feeDue.lateFeeConfigSnapshot ?? lateFeeConfig;
    if (effectiveConfig) {
      lateFee = computeLateFee(feeDue.dueDate, today, effectiveConfig);
    }
  }
  return {
    id: feeDue.id.toString(),
    academyId: feeDue.academyId,
    studentId: feeDue.studentId,
    monthKey: feeDue.monthKey,
    dueDate: feeDue.dueDate,
    amount: feeDue.amount,
    lateFee,
    totalPayable: feeDue.amount + lateFee,
    status: feeDue.status,
    paidAt: feeDue.paidAt ? feeDue.paidAt.toISOString() : null,
    paidByUserId: feeDue.paidByUserId,
    paidSource: feeDue.paidSource,
    paymentLabel: feeDue.paymentLabel,
    collectedByUserId: feeDue.collectedByUserId,
    approvedByUserId: feeDue.approvedByUserId,
    paymentRequestId: feeDue.paymentRequestId,
    createdAt: feeDue.audit.createdAt.toISOString(),
    updatedAt: feeDue.audit.updatedAt.toISOString(),
  };
}
