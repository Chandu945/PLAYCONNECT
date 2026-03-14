import { Injectable } from '@nestjs/common';

export const LOGIN_ATTEMPT_TRACKER = Symbol('LOGIN_ATTEMPT_TRACKER');

interface AttemptRecord {
  count: number;
  lockedUntil: Date | null;
}

const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class LoginAttemptTracker {
  private readonly attempts = new Map<string, AttemptRecord>();

  /**
   * Returns true if the account is currently locked out.
   * Also cleans up stale entries on each check.
   */
  isLocked(email: string): boolean {
    this.cleanup();
    const key = email.toLowerCase();
    const record = this.attempts.get(key);
    if (!record?.lockedUntil) return false;
    if (record.lockedUntil.getTime() <= Date.now()) {
      this.attempts.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Record a failed login attempt. Locks the account after MAX_ATTEMPTS failures.
   */
  recordFailure(email: string): void {
    const key = email.toLowerCase();
    const record = this.attempts.get(key) ?? { count: 0, lockedUntil: null };
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }
    this.attempts.set(key, record);
  }

  /**
   * Reset attempt counter on successful login.
   */
  recordSuccess(email: string): void {
    const key = email.toLowerCase();
    this.attempts.delete(key);
  }

  /**
   * Remove entries whose lockout has expired.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts) {
      if (record.lockedUntil && record.lockedUntil.getTime() <= now) {
        this.attempts.delete(key);
      }
    }
  }
}
