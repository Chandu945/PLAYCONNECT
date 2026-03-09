import type { UserRole } from '@playconnect/contracts';
import { getDaysInMonth } from '@domain/attendance/value-objects/local-date.vo';

/**
 * Domain rules for fee dues.
 * Pure functions — no framework dependencies.
 */

export function isEligibleForDue(
  joiningDate: Date,
  monthKey: string,
  isActive: boolean,
  isDeleted: boolean,
): boolean {
  if (!isActive || isDeleted) return false;

  const [year, month] = monthKey.split('-').map(Number);

  // Compare using local date components (relies on TZ=Asia/Kolkata)
  const joinYear = joiningDate.getFullYear();
  const joinMonth = joiningDate.getMonth() + 1;
  const joinDay = joiningDate.getDate();

  // If joining year-month is after the target month, not eligible
  if (joinYear > year! || (joinYear === year! && joinMonth > month!)) return false;

  // If same month but joined after the 15th, not eligible (late-month join)
  if (joinYear === year! && joinMonth === month! && joinDay > 15) return false;

  return true;
}

export function shouldFlipToDue(todayDay: number, dueDateDay: number): boolean {
  return todayDay >= dueDateDay;
}

export function computeDueDate(monthKey: string, dueDateDay: number): string {
  const daysInMonth = getDaysInMonth(monthKey);
  const clampedDay = Math.min(dueDateDay, daysInMonth);
  return `${monthKey}-${String(clampedDay).padStart(2, '0')}`;
}

export function canViewFees(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER' && role !== 'STAFF') {
    return { allowed: false, reason: 'Only owners and staff can view fees' };
  }
  return { allowed: true };
}

export function canMarkPaid(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER') {
    return { allowed: false, reason: 'Only owners can mark fees as paid' };
  }
  return { allowed: true };
}

export function canViewDashboard(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER') {
    return { allowed: false, reason: 'Only owners can view the dashboard' };
  }
  return { allowed: true };
}

export function canViewReports(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER') {
    return { allowed: false, reason: 'Only owners can view reports' };
  }
  return { allowed: true };
}
