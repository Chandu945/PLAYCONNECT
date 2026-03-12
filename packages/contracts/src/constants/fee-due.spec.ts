import { computeLateFee, type LateFeeConfig } from './fee-due';

const enabledConfig: LateFeeConfig = {
  lateFeeEnabled: true,
  gracePeriodDays: 5,
  lateFeeAmountInr: 50,
  lateFeeRepeatIntervalDays: 5,
};

describe('computeLateFee', () => {
  it('returns 0 when late fee is disabled', () => {
    const config: LateFeeConfig = { ...enabledConfig, lateFeeEnabled: false };
    expect(computeLateFee('2024-03-05', '2024-04-01', config)).toBe(0);
  });

  it('returns 0 when late fee amount is 0', () => {
    const config: LateFeeConfig = { ...enabledConfig, lateFeeAmountInr: 0 };
    expect(computeLateFee('2024-03-05', '2024-04-01', config)).toBe(0);
  });

  it('returns 0 when today is before due date', () => {
    expect(computeLateFee('2024-03-05', '2024-03-03', enabledConfig)).toBe(0);
  });

  it('returns 0 when today is the due date', () => {
    expect(computeLateFee('2024-03-05', '2024-03-05', enabledConfig)).toBe(0);
  });

  it('returns 0 within grace period', () => {
    // Due: Mar 5, grace: 5 days → no late fee until Mar 11
    expect(computeLateFee('2024-03-05', '2024-03-06', enabledConfig)).toBe(0); // 1 day past
    expect(computeLateFee('2024-03-05', '2024-03-10', enabledConfig)).toBe(0); // 5 days past = boundary
  });

  it('returns one application on the first day after grace period', () => {
    // Due: Mar 5, grace: 5 → first late fee on Mar 11 (6 days past)
    expect(computeLateFee('2024-03-05', '2024-03-11', enabledConfig)).toBe(50);
  });

  it('returns one application for days within first repeat interval', () => {
    // Days 6-10 past due (Mar 11-15) → 1 application
    expect(computeLateFee('2024-03-05', '2024-03-12', enabledConfig)).toBe(50);
    expect(computeLateFee('2024-03-05', '2024-03-15', enabledConfig)).toBe(50);
  });

  it('returns two applications after first repeat interval', () => {
    // Day 11 past due (Mar 16) → 2 applications
    expect(computeLateFee('2024-03-05', '2024-03-16', enabledConfig)).toBe(100);
  });

  it('returns correct applications for 1-day repeat interval', () => {
    const config: LateFeeConfig = { ...enabledConfig, lateFeeRepeatIntervalDays: 1 };
    // Due: Mar 5, grace: 5 → first late fee on Mar 11
    expect(computeLateFee('2024-03-05', '2024-03-11', config)).toBe(50);  // 1 application
    expect(computeLateFee('2024-03-05', '2024-03-12', config)).toBe(100); // 2 applications
    expect(computeLateFee('2024-03-05', '2024-03-13', config)).toBe(150); // 3 applications
  });

  it('returns correct applications for 3-day repeat interval', () => {
    const config: LateFeeConfig = { ...enabledConfig, lateFeeRepeatIntervalDays: 3 };
    // Due: Mar 5, grace: 5 → first late fee on Mar 11 (day 6)
    expect(computeLateFee('2024-03-05', '2024-03-11', config)).toBe(50);  // day 6: 1 app
    expect(computeLateFee('2024-03-05', '2024-03-13', config)).toBe(50);  // day 8: still 1 app
    expect(computeLateFee('2024-03-05', '2024-03-14', config)).toBe(100); // day 9: 2 apps
  });

  it('handles 0-day grace period', () => {
    const config: LateFeeConfig = { ...enabledConfig, gracePeriodDays: 0 };
    // Due: Mar 5, no grace → late fee starts Mar 6 (1 day past)
    expect(computeLateFee('2024-03-05', '2024-03-05', config)).toBe(0);
    expect(computeLateFee('2024-03-05', '2024-03-06', config)).toBe(50);
  });

  it('accumulates correctly over long periods', () => {
    // Due: Mar 5, grace: 5, repeat: 5, amount: 50
    // First fee: Mar 11 (day 6), then every 5 days
    // Mar 31 = day 26. daysIntoLateFee = 21. apps = floor((21-1)/5) + 1 = floor(4) + 1 = 5
    expect(computeLateFee('2024-03-05', '2024-03-31', enabledConfig)).toBe(250);
  });
});
