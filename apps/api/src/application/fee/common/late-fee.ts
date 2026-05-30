import type { LateFeeConfig, LateFeeRepeatInterval } from '@academyflo/contracts';
import { computeLateFee } from '@academyflo/contracts';

/**
 * Minimal shape of an Academy that provides live late-fee config fields.
 * Kept structural so any Academy-like projection fits without a domain import.
 */
export interface LateFeeAcademyFields {
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: number;
}

/**
 * Build a LateFeeConfig from an Academy's live late-fee fields.
 * Returns undefined if late-fee is disabled on the academy so the caller can
 * fall back to a snapshot or skip the computation entirely.
 */
export function buildLateFeeConfigFromAcademy(
  academy: LateFeeAcademyFields | null | undefined,
): LateFeeConfig | undefined {
  if (!academy?.lateFeeEnabled) return undefined;
  return {
    lateFeeEnabled: academy.lateFeeEnabled,
    gracePeriodDays: academy.gracePeriodDays,
    lateFeeAmountInr: academy.lateFeeAmountInr,
    lateFeeRepeatIntervalDays: academy.lateFeeRepeatIntervalDays as LateFeeRepeatInterval,
  };
}

/**
 * Resolve the late-fee config to use when computing the late fee for a
 * specific fee_due. Encodes the two invariants that drive how snapshots
 * interact with live academy config:
 *
 *   1. **Live "enabled" is the kill-switch (L1 fix).** If the academy has
 *      late-fee toggled OFF (liveConfig undefined), no late fee applies —
 *      regardless of any snapshot the fee may carry. The owner's toggle is
 *      their immediate intent and ALWAYS wins. This prevents the surprise
 *      where an owner disables late fee in settings but parents continue
 *      to see late-fee charges on already-snapshotted overdue fees.
 *
 *   2. **Snapshot locks the amounts (M1 invariant).** When late fee is
 *      enabled, the snapshot wins for amount/grace/interval — the rate
 *      that was live when the fee became DUE is what the parent owes.
 *      Protects against retroactive re-pricing if the owner raises the
 *      rate mid-cycle.
 *
 * Re-enable semantics: an owner who disables then re-enables late fee
 * resumes accrual on snapshotted fees at the SAME rate as before — the
 * snapshot is still on the record, just gated by the live toggle.
 */
export function buildEffectiveLateFeeConfig(
  snapshot: LateFeeConfig | null,
  liveConfig: LateFeeConfig | undefined,
): LateFeeConfig | undefined {
  if (!liveConfig) return undefined;
  return snapshot ?? liveConfig;
}

/**
 * Late fee currently owed on a single unpaid (UPCOMING/DUE) fee due — honoring
 * the snapshot + the live "enabled" kill-switch (L1). Returns 0 when late fee is
 * disabled or none has accrued yet. Pass `liveConfig` from
 * buildLateFeeConfigFromAcademy and `todayStr` from formatLocalDate(clock.now()).
 * Centralizes the per-due late-fee math the dashboard, month-wise report, and
 * parent views already use, so the dues reports agree with them.
 */
export function lateFeeForUnpaidDue(
  due: { dueDate: string; lateFeeConfigSnapshot: LateFeeConfig | null },
  liveConfig: LateFeeConfig | undefined,
  todayStr: string,
): number {
  const effectiveConfig = buildEffectiveLateFeeConfig(due.lateFeeConfigSnapshot, liveConfig);
  if (!effectiveConfig) return 0;
  const computed = computeLateFee(due.dueDate, todayStr, effectiveConfig);
  return Number.isFinite(computed) ? computed : 0;
}
