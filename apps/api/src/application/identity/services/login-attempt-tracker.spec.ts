import { LoginAttemptTracker } from './login-attempt-tracker';

describe('LoginAttemptTracker', () => {
  let tracker: LoginAttemptTracker;

  beforeEach(() => {
    tracker = new LoginAttemptTracker();
  });

  it('should not be locked initially', () => {
    expect(tracker.isLocked('user@test.com')).toBe(false);
  });

  it('should not lock after fewer than 10 failed attempts', () => {
    for (let i = 0; i < 9; i++) {
      tracker.recordFailure('user@test.com');
    }
    expect(tracker.isLocked('user@test.com')).toBe(false);
  });

  it('should lock after 10 failed attempts', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordFailure('user@test.com');
    }
    expect(tracker.isLocked('user@test.com')).toBe(true);
  });

  it('should be case-insensitive on email', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordFailure('User@Test.COM');
    }
    expect(tracker.isLocked('user@test.com')).toBe(true);
  });

  it('should reset on successful login', () => {
    for (let i = 0; i < 9; i++) {
      tracker.recordFailure('user@test.com');
    }
    tracker.recordSuccess('user@test.com');
    // After reset, one more failure should not lock
    tracker.recordFailure('user@test.com');
    expect(tracker.isLocked('user@test.com')).toBe(false);
  });

  it('should unlock after lockout period expires', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordFailure('user@test.com');
    }
    expect(tracker.isLocked('user@test.com')).toBe(true);

    // Advance time past lockout (15 minutes)
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000 + 1);

    expect(tracker.isLocked('user@test.com')).toBe(false);

    jest.restoreAllMocks();
  });

  it('should not affect other accounts', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordFailure('locked@test.com');
    }
    expect(tracker.isLocked('locked@test.com')).toBe(true);
    expect(tracker.isLocked('other@test.com')).toBe(false);
  });
});
