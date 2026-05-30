import { paymentsInMonth } from './ParentDashboardScreen';

describe('paymentsInMonth — "Paid This Month" uses this-month payments only', () => {
  const payments = [
    { paidAt: '2026-05-03', amount: 500 },
    { paidAt: '2026-05-20', amount: 300 },
    { paidAt: '2026-04-28', amount: 1000 }, // previous month
    { paidAt: '2025-12-01', amount: 1000 }, // last year
    { paidAt: null, amount: 200 }, // missing date
  ];

  it('returns only the payments in the given month (for both count and total)', () => {
    const thisMonth = paymentsInMonth(payments, '2026-05');

    expect(thisMonth).toHaveLength(2); // not 5 (all-time)
    expect(thisMonth.reduce((s, p) => s + p.amount, 0)).toBe(800);
    expect(thisMonth.every((p) => p.paidAt?.startsWith('2026-05'))).toBe(true);
  });

  it('returns an empty list when no payment falls in the month', () => {
    expect(paymentsInMonth(payments, '2026-06')).toEqual([]);
  });
});
