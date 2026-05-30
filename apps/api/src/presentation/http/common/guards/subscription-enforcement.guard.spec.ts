import type { ExecutionContext } from '@nestjs/common';
import { SubscriptionEnforcementGuard } from './subscription-enforcement.guard';

function makeContext(path: string, user?: { userId: string; role: string }): ExecutionContext {
  const request: Record<string, unknown> = { path, method: 'GET', user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('SubscriptionEnforcementGuard', () => {
  it('allows account-deletion even for a blocked subscription (Play/GDPR deletion right stays open)', async () => {
    // Allowlisted paths must short-circuit BEFORE any subscription check.
    const getSubscription = { execute: jest.fn() };
    const guard = new SubscriptionEnforcementGuard(getSubscription as never, logger as never);

    const result = await guard.canActivate(
      makeContext('/api/v1/account/deletion', { userId: 'owner-1', role: 'OWNER' }),
    );

    expect(result).toBe(true);
    expect(getSubscription.execute).not.toHaveBeenCalled();
  });

  it('still blocks a non-allowlisted data route when the subscription cannot access the app', async () => {
    const getSubscription = {
      execute: jest.fn().mockResolvedValue({
        ok: true,
        value: { canAccessApp: false, status: 'BLOCKED' },
      }),
    };
    const guard = new SubscriptionEnforcementGuard(getSubscription as never, logger as never);

    await expect(
      guard.canActivate(makeContext('/api/v1/students', { userId: 'owner-1', role: 'OWNER' })),
    ).rejects.toThrow();
  });
});
