import { computeOutstandingSummary, groupFeeHistoryForDisplay } from './fee-summary';
import type { FeeDueItem } from './fees.types';

function item(
  monthKey: string,
  status: FeeDueItem['status'],
  amount: number,
  lateFee = 0,
): FeeDueItem {
  return {
    id: `id-${monthKey}`,
    academyId: 'a1',
    studentId: 's1',
    studentName: 'Dhruv Verma',
    monthKey,
    dueDate: `${monthKey}-05`,
    amount,
    lateFee,
    totalPayable: amount + lateFee,
    status,
    paidAt: null,
    paidByUserId: null,
    paidSource: null,
    paymentLabel: null,
    collectedByUserId: null,
    approvedByUserId: null,
    paymentRequestId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('computeOutstandingSummary', () => {
  it("sums every unpaid month's payable (incl. late fees) and ignores paid ones", () => {
    const items = [
      item('2025-10', 'PAID', 800),
      item('2025-11', 'DUE', 800, 4100), // overdue with late fee → ₹4,900
      item('2026-01', 'PAID', 800),
      item('2026-06', 'UPCOMING', 800), // current month → ₹800
    ];

    const summary = computeOutstandingSummary(items);

    expect(summary.totalOutstanding).toBe(5700); // 4900 + 800
    expect(summary.monthsCount).toBe(2);
    expect(summary.monthKeys).toEqual(['2025-11', '2026-06']); // chronological
  });

  it('returns a zero summary when everything is paid', () => {
    const summary = computeOutstandingSummary([
      item('2026-04', 'PAID', 800),
      item('2026-05', 'PAID', 800),
    ]);
    expect(summary).toEqual({ totalOutstanding: 0, monthsCount: 0, monthKeys: [] });
  });
});

describe('groupFeeHistoryForDisplay', () => {
  it('keeps the current year in full but drops previous-year PAID months (keeps earlier dues)', () => {
    const { earlierDues, currentYear } = groupFeeHistoryForDisplay([
      item('2025-10', 'PAID', 800), // prev year, paid → dropped
      item('2025-11', 'DUE', 800, 4100), // prev year, due → kept
      item('2025-12', 'DUE', 800, 3500), // prev year, due → kept
      item('2026-01', 'PAID', 800), // current year → kept
      item('2026-06', 'UPCOMING', 800), // current year → kept
    ]);

    expect(earlierDues.map((i) => i.monthKey)).toEqual(['2025-11', '2025-12']);
    expect(currentYear.map((i) => i.monthKey)).toEqual(['2026-01', '2026-06']);
  });

  it('returns no earlier dues when the whole history is in the current year', () => {
    const { earlierDues, currentYear } = groupFeeHistoryForDisplay([
      item('2026-05', 'PAID', 800),
      item('2026-06', 'UPCOMING', 800),
    ]);

    expect(earlierDues).toEqual([]);
    expect(currentYear).toHaveLength(2);
  });
});
