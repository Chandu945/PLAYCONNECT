import type { FeeDueStatus } from '@academyflo/contracts';

export interface StudentWiseDueItemDto {
  studentId: string;
  studentName: string;
  monthKey: string;
  /** Base monthly fee for the selected month's due. */
  amount: number;
  /** Late fee accrued on the selected month's due (0 if none/disabled). */
  lateFee: number;
  /** amount + lateFee — what's actually owed for the selected month. */
  totalPayable: number;
  status: FeeDueStatus;
  pendingMonthsCount: number;
  /** Base + late fee owed across ALL unpaid months for this student. */
  totalPendingAmount: number;
}
