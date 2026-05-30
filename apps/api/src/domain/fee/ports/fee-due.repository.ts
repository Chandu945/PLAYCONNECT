import type { FeeDue } from '../entities/fee-due.entity';
import type { FeeDueStatus, LateFeeConfig } from '@academyflo/contracts';

export const FEE_DUE_REPOSITORY = Symbol('FEE_DUE_REPOSITORY');

export interface FeeDueRepository {
  save(feeDue: FeeDue): Promise<void>;
  bulkSave(feeDues: FeeDue[]): Promise<void>;
  findById(id: string): Promise<FeeDue | null>;
  bulkUpdateStatus(
    ids: string[],
    status: FeeDueStatus,
    expectedCurrentStatus?: FeeDueStatus,
  ): Promise<void>;
  findByAcademyStudentMonth(
    academyId: string,
    studentId: string,
    monthKey: string,
  ): Promise<FeeDue | null>;
  listByAcademyMonthAndStatuses(
    academyId: string,
    monthKey: string,
    statuses: FeeDueStatus[],
  ): Promise<FeeDue[]>;
  listByAcademyMonthPaid(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listByStudentAndRange(
    academyId: string,
    studentId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<FeeDue[]>;
  listUpcomingByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listUnpaidByAcademy(academyId: string): Promise<FeeDue[]>;
  /**
   * DB-side SUM of unpaid fee amounts across the academy (statuses UPCOMING + DUE).
   * Avoids round-tripping every fee-due document just to compute a single total
   * — see `GetOwnerDashboardKpisUseCase`.
   */
  sumUnpaidAmountByAcademy(academyId: string): Promise<number>;
  /**
   * DB-side SUM of unpaid fee amounts for a specific month. Used by the
   * dashboard's Pending tile so the value tracks the picked month (past
   * months without dues correctly show ₹0).
   */
  sumUnpaidAmountByAcademyAndMonth(academyId: string, monthKey: string): Promise<number>;
  /**
   * DB-side DISTINCT-count of students with at least one unpaid fee
   * (UPCOMING or DUE) in the given month.
   */
  countDistinctUnpaidStudentsByAcademyAndMonth(
    academyId: string,
    monthKey: string,
  ): Promise<number>;
  /**
   * DB-side count of unpaid dues (UPCOMING + DUE) grouped by student, across
   * ALL months. Returns a studentId → count map. Used by the unpaid dues list
   * to show each student's total number of unpaid months.
   */
  countUnpaidDuesGroupedByStudent(academyId: string): Promise<Record<string, number>>;
  findUnpaidByDueDate(dueDate: string): Promise<FeeDue[]>;
  findOverdueDues(upToDate: string): Promise<FeeDue[]>;
  findDueWithoutSnapshot(academyId: string): Promise<FeeDue[]>;
  /**
   * Conditional snapshot write — sets the late-fee config snapshot on a fee
   * ONLY if it's still in DUE status AND still has no snapshot. Race-safe
   * against a concurrent `mark-fee-paid` that may have transitioned the
   * record to PAID between when the cron loaded it and when the cron writes.
   *
   * Returns true if the snapshot was applied, false if the precondition
   * failed (fee was concurrently paid, or already snapshotted). Callers use
   * the return value to count actual applications for telemetry.
   */
  saveSnapshotIfStillDue(id: string, snapshot: LateFeeConfig): Promise<boolean>;
  deleteUpcomingByStudent(academyId: string, studentId: string): Promise<number>;
  /**
   * DB-side SUM of lateFeeApplied for PAID fee dues in a given academy + month.
   */
  sumLateFeeCollectedByAcademyAndMonth(academyId: string, monthKey: string): Promise<number>;
  /**
   * DB-side SUM of lateFeeApplied for PAID fee dues whose paidAt falls in the
   * given range (cash-bucketed). Used by the dashboard's Late Fees tile so the
   * value tracks "cash collected this month" rather than "late fee accrued on
   * this month's dues" — keeps the tile consistent with Total Collected, which
   * also buckets by transaction date.
   */
  sumLateFeeCollectedByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<number>;
  /**
   * DB-side COUNT of fee dues with status='DUE' and dueDate <= today.
   */
  countOverdueByAcademy(academyId: string, today: string): Promise<number>;
  /**
   * List all overdue fee dues for a given academy (status='DUE', dueDate <= today).
   */
  listOverdueByAcademy(academyId: string, today: string): Promise<FeeDue[]>;
}
