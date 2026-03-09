import type { TierKey } from '@playconnect/contracts';
import { TIER_TABLE } from '@domain/subscription/rules/subscription-tier.rules';
import { randomUUID } from 'node:crypto';

/**
 * Look up the price for a tier key. Throws if tier not found (programming error).
 */
export function priceForTier(tierKey: TierKey): number {
  const tier = TIER_TABLE.find((t) => t.tierKey === tierKey);
  if (!tier) throw new Error(`Unknown tier: ${tierKey}`);
  return tier.priceInr;
}

/**
 * Validate that amount matches expected tier price.
 */
export function isAmountValid(tierKey: TierKey, amountInr: number): boolean {
  return priceForTier(tierKey) === amountInr;
}

/**
 * Generate an internal order ID for Cashfree.
 * Format: pc_sub_{YYYYMMDD}_{random} — length 3-45, allowed chars: alphanumeric, _, -
 */
export function generateOrderId(): string {
  const now = new Date();
  const dateStr =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const random = randomUUID().replace(/-/g, '').substring(0, 12);
  return `pc_sub_${dateStr}_${random}`;
}

/**
 * Compute paid subscription start/end dates based on trial status.
 *
 * If trial is still active at purchase time:
 *   paidStartAt = dayAfter(trialEndAt) in IST
 *   paidEndAt = paidStartAt + 1 month - 1 day
 *
 * Otherwise:
 *   paidStartAt = now (IST)
 *   paidEndAt = paidStartAt + 1 month - 1 day
 */
export function computePaidDates(
  now: Date,
  trialEndAt: Date,
): { paidStartAt: Date; paidEndAt: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  let paidStartAt: Date;

  if (now.getTime() <= trialEndAt.getTime()) {
    // Trial still active — start day after trial ends
    const dayAfterTrial = new Date(trialEndAt.getTime() + 24 * 60 * 60 * 1000);
    const istDate = new Date(dayAfterTrial.getTime() + IST_OFFSET_MS);
    const year = istDate.getUTCFullYear();
    const month = istDate.getUTCMonth();
    const day = istDate.getUTCDate();
    paidStartAt = new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
  } else {
    const istDate = new Date(now.getTime() + IST_OFFSET_MS);
    const year = istDate.getUTCFullYear();
    const month = istDate.getUTCMonth();
    const day = istDate.getUTCDate();
    paidStartAt = new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
  }

  // paidEndAt = paidStartAt + 1 month - 1 day, at IST 23:59:59.999
  // Use UTC-based arithmetic to avoid server-local timezone issues
  const startIST = new Date(paidStartAt.getTime() + IST_OFFSET_MS);
  const y = startIST.getUTCFullYear();
  const m = startIST.getUTCMonth();
  const d = startIST.getUTCDate();
  // Add 1 month, subtract 1 day, set to end of day in IST
  const endDateIST = new Date(Date.UTC(y, m + 1, d - 1));
  const paidEndAt = new Date(endDateIST.getTime() - IST_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);

  return { paidStartAt, paidEndAt };
}
