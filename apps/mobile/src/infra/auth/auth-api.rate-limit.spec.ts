import { authApi } from './auth-api';
import type { LoginRequest } from '../../domain/auth/auth.types';

describe('authApi — rate-limit cooldown uses the server Retry-After', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  function mock429(retryAfter: string | null) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ code: 'RATE_LIMITED', message: 'Too many requests' }),
      headers: {
        get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter : null),
      },
    }) as unknown as typeof fetch;
  }

  const req = { identifier: 'user@test.com', password: 'pw' } as unknown as LoginRequest;

  it('surfaces the Retry-After header value as retryAfterSeconds', async () => {
    mock429('120');
    const result = await authApi.login(req);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
    // The bug under test: this was undefined (→ hardcoded 30s) before the fix.
    expect(result.error.retryAfterSeconds).toBe(120);
  });

  it('leaves retryAfterSeconds unset when the server sends no header', async () => {
    mock429(null);
    const result = await authApi.login(req);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
    expect(result.error.retryAfterSeconds).toBeUndefined();
  });
});
