import { getFeeMonthRange, FEE_LOOKBACK_MONTHS } from './ChildDetailScreen';

function toAbs(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return y! * 12 + (m! - 1);
}

describe('ChildDetailScreen fee look-back window', () => {
  it('spans the full dashboard look-back (24 months back through next month)', () => {
    const { from, to } = getFeeMonthRange();
    // 24 months back + 1 month forward = 25 months apart (the old window was 6).
    expect(toAbs(to) - toAbs(from)).toBe(FEE_LOOKBACK_MONTHS + 1);
  });

  it('produces valid YYYY-MM keys with correct year rollover', () => {
    const { from, to } = getFeeMonthRange();
    expect(from).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(to).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(toAbs(to)).toBeGreaterThan(toAbs(from));
  });
});
