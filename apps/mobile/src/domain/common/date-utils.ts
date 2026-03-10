/** IST is UTC+5:30 = 330 minutes ahead of UTC */
export const IST_OFFSET_MINUTES = 330;

/** IST offset in milliseconds */
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/** Returns the current Date adjusted to IST regardless of device timezone */
export function nowIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + (IST_OFFSET_MINUTES - now.getTimezoneOffset()) * 60_000);
}

/** Returns today's date in IST as YYYY-MM-DD */
export function getTodayIST(): string {
  const ist = nowIST();
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the current month in IST as YYYY-MM */
export function getCurrentMonthIST(): string {
  const ist = nowIST();
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Validates a YYYY-MM-DD date string.
 * Returns true if the format is valid AND the date actually exists (e.g. rejects 2026-02-30).
 */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
