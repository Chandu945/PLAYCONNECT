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

export type FeeHistoryGroups = {
  /** Previous-year months — only the outstanding dues (old paid months dropped). */
  earlierDues: FeeDueItem[];
  /** Current-year months — every one (paid + unpaid), shown as usual. */
  currentYear: FeeDueItem[];
};

/**
 * Group a student's full fee history for the detail list: show the current year
 * in full (paid + unpaid) as usual, but for earlier years keep only outstanding
 * dues and drop old paid months (which are just noise). Preserves input order.
 *
 * "Current year" is derived from the most recent month in the history (the API
 * caps the range at the current month), so it's timezone-independent.
 */
export function groupFeeHistoryForDisplay(items: FeeDueItem[]): FeeHistoryGroups {
  if (items.length === 0) return { earlierDues: [], currentYear: [] };
  const latestYear = items
    .reduce((max, i) => (i.monthKey > max ? i.monthKey : max), items[0]!.monthKey)
    .slice(0, 4);
  const earlierDues: FeeDueItem[] = [];
  const currentYear: FeeDueItem[] = [];
  for (const i of items) {
    if (i.monthKey.slice(0, 4) >= latestYear) currentYear.push(i);
    else if (i.status !== 'PAID') earlierDues.push(i);
  }
  return { earlierDues, currentYear };
}
