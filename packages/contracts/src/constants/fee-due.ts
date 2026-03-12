/** Fee due lifecycle statuses */
export type FeeDueStatus = 'UPCOMING' | 'DUE' | 'PAID';

export const FEE_DUE_STATUSES = ['UPCOMING', 'DUE', 'PAID'] as const;

/** How the payment was initiated */
export type PaidSource = 'OWNER_DIRECT' | 'STAFF_APPROVED' | 'PARENT_ONLINE';

/** Payment instrument label */
export type PaymentLabel = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'ONLINE';

/** Default due-date day of month (1-28) */
export const DEFAULT_DUE_DATE_DAY = 5;

/** Default receipt prefix */
export const DEFAULT_RECEIPT_PREFIX = 'PC';

/** Convenience fee rate for parent online payments (2.5%) */
export const CONVENIENCE_FEE_RATE = 0.025;

/** Compute convenience fee (rounded to nearest rupee) */
export function computeConvenienceFee(baseAmount: number): number {
  return Math.round(baseAmount * CONVENIENCE_FEE_RATE);
}

// Late fee defaults
export const DEFAULT_LATE_FEE_ENABLED = false;
export const DEFAULT_GRACE_PERIOD_DAYS = 5;
export const DEFAULT_LATE_FEE_AMOUNT_INR = 0;
export const DEFAULT_LATE_FEE_REPEAT_INTERVAL_DAYS = 5;
export const ALLOWED_REPEAT_INTERVALS = [1, 3, 5] as const;
export type LateFeeRepeatInterval = 1 | 3 | 5;

export interface LateFeeConfig {
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: LateFeeRepeatInterval;
}

/**
 * Compute late fee for an unpaid fee due.
 * Pure function — no side effects. Used by both API and mobile.
 *
 * @param dueDate - ISO date string "YYYY-MM-DD" (the fee's due date)
 * @param today - ISO date string "YYYY-MM-DD" (current date)
 * @param config - Academy late fee configuration
 * @returns lateFee amount in INR (0 if not applicable)
 */
export function computeLateFee(
  dueDate: string,
  today: string,
  config: LateFeeConfig,
): number {
  if (!config.lateFeeEnabled || config.lateFeeAmountInr <= 0) return 0;

  const dueDateMs = new Date(dueDate + 'T00:00:00').getTime();
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const daysPastDue = Math.floor((todayMs - dueDateMs) / dayMs);
  if (daysPastDue <= config.gracePeriodDays) return 0;

  // First late fee date = dueDate + gracePeriodDays + 1
  const daysIntoLateFee = daysPastDue - config.gracePeriodDays;
  const applications = Math.floor((daysIntoLateFee - 1) / config.lateFeeRepeatIntervalDays) + 1;

  return applications * config.lateFeeAmountInr;
}
