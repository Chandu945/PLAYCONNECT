import type { Weekday } from '@playconnect/contracts';
import { WEEKDAYS } from '@playconnect/contracts';
import type { UserRole } from '@playconnect/contracts';

export function validateBatchName(name: string): { valid: boolean; reason?: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, reason: 'Batch name must be at least 2 characters' };
  }
  if (trimmed.length > 60) {
    return { valid: false, reason: 'Batch name must not exceed 60 characters' };
  }
  return { valid: true };
}

export function validateDays(days: Weekday[]): { valid: boolean; reason?: string } {
  if (!days || days.length === 0) {
    return { valid: true };
  }
  const invalid = days.filter((d) => !WEEKDAYS.includes(d));
  if (invalid.length > 0) {
    return { valid: false, reason: `Invalid weekday(s): ${invalid.join(', ')}` };
  }
  const unique = new Set(days);
  if (unique.size !== days.length) {
    return { valid: false, reason: 'Duplicate weekdays are not allowed' };
  }
  return { valid: true };
}

export function validateNotes(notes: string): { valid: boolean; reason?: string } {
  if (notes.length > 500) {
    return { valid: false, reason: 'Notes must not exceed 500 characters' };
  }
  return { valid: true };
}

export function validateTime(time: string): { valid: boolean; reason?: string } {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { valid: false, reason: 'Time must be in HH:mm format' };
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (hours! < 0 || hours! > 23) {
    return { valid: false, reason: 'Hours must be between 00 and 23' };
  }
  if (minutes! < 0 || minutes! > 59) {
    return { valid: false, reason: 'Minutes must be between 00 and 59' };
  }
  return { valid: true };
}

export function validateTimeRange(
  start: string,
  end: string,
): { valid: boolean; reason?: string } {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH! * 60 + startM!;
  const endMinutes = endH! * 60 + endM!;
  if (endMinutes <= startMinutes) {
    return { valid: false, reason: 'End time must be after start time' };
  }
  return { valid: true };
}

export function validateMaxStudents(max: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(max) || max < 1) {
    return { valid: false, reason: 'Max students must be a positive integer' };
  }
  return { valid: true };
}

export function canManageBatch(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER' && role !== 'STAFF') {
    return { allowed: false, reason: 'Only owners and staff can create or update batches' };
  }
  return { allowed: true };
}

export function canReadBatch(role: UserRole): { allowed: boolean; reason?: string } {
  if (role !== 'OWNER' && role !== 'STAFF') {
    return { allowed: false, reason: 'Only owners and staff can view batches' };
  }
  return { allowed: true };
}
