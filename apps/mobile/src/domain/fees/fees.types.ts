import type { FeeDueStatus, PaidSource, PaymentLabel } from '@academyflo/contracts';
export type { FeeDueStatus, PaidSource, PaymentLabel } from '@academyflo/contracts';

export type FeeDueItem = {
  id: string;
  academyId: string;
  studentId: string;
  studentName: string | null;
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
  /** Contact phone for the student (unpaid-dues list only; mobile → guardian
   *  → WhatsApp). Absent on surfaces that don't project it (e.g. Paid list). */
  studentPhone?: string | null;
  /** Total number of unpaid months this student owes across all months
   *  (unpaid-dues list only). Lets each row show "N months due". */
  unpaidMonthsCount?: number;
};
