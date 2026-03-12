import type { UserRole } from '@playconnect/contracts';

/**
 * Domain rules for academy setup and settings.
 * Pure functions — no framework dependencies.
 */
export function canSetupAcademy(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER') {
    return { allowed: false, reason: 'Only owners can set up an academy' };
  }
  return { allowed: true };
}

export function validateDefaultDueDateDay(day: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return { valid: false, reason: 'Due date day must be an integer between 1 and 28' };
  }
  return { valid: true };
}

export function validateReceiptPrefix(prefix: string): { valid: boolean; reason?: string } {
  if (prefix.length > 20) {
    return { valid: false, reason: 'Receipt prefix must be at most 20 characters' };
  }
  return { valid: true };
}

export function canViewSettings(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER' && role !== 'STAFF') {
    return { allowed: false, reason: 'Only owners and staff can view settings' };
  }
  return { allowed: true };
}

export function canUpdateSettings(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER') {
    return { allowed: false, reason: 'Only owners can update settings' };
  }
  return { allowed: true };
}

export function validateGracePeriodDays(days: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(days) || days < 0 || days > 30)
    return { valid: false, reason: 'Grace period must be 0–30 days' };
  return { valid: true };
}

export function validateLateFeeAmountInr(amount: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(amount) || amount < 0 || amount > 10000)
    return { valid: false, reason: 'Late fee amount must be 0–10000 INR' };
  return { valid: true };
}

export function validateLateFeeRepeatIntervalDays(interval: number): { valid: boolean; reason?: string } {
  if (![1, 3, 5].includes(interval))
    return { valid: false, reason: 'Repeat interval must be 1, 3, or 5 days' };
  return { valid: true };
}
