import type { FeeDueItem } from './fees.types';

export type OutstandingSummary = {
  /** Sum of every unpaid due's payable (base + live late fee). */
  totalOutstanding: number;
  /** Number of unpaid months (DUE + UPCOMING). */
  monthsCount: number;
  /** Month keys of the unpaid dues, chronological (e.g. ['2025-11', '2026-06']). */
  monthKeys: string[];
};

/**
 * Compute a student's outstanding fee summary from their full fee history.
 *
 * Shared by both fee-detail surfaces (the Fees-tab StudentFeeDetailScreen and
 * the Students-tab StudentDetailScreen) so the headline total always matches
 * the Fees list row and the two screens can never disagree. "Unpaid" = any due
 * that is not PAID (DUE or UPCOMING); `totalPayable` already includes the live
 * late fee for overdue dues.
 */
export function computeOutstandingSummary(items: FeeDueItem[]): OutstandingSummary {
  const unpaid = items.filter((i) => i.status !== 'PAID');
  const totalOutstanding = unpaid.reduce((sum, i) => sum + i.totalPayable, 0);
  const monthKeys = unpaid.map((i) => i.monthKey).sort();
  return { totalOutstanding, monthsCount: unpaid.length, monthKeys };
}
