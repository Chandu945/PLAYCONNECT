/**
 * Covers the core of the "no auto-logout on transient failure" fix:
 * tryRefresh signals logout ONLY on a definitive server revoke (401/403),
 * never on a transient failure (5xx/network), and request() surfaces a
 * retryable NETWORK error (keeping the user signed in) when the refresh fails
 * transiently while the session is still stored.
 */
jest.mock('../auth/token-store', () => ({
  tokenStore: {
    getSession: jest.fn(),
    setSession: jest.fn().mockResolvedValue(undefined),
    clearSession: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../auth/device-id', () => ({
  deviceIdStore: { getDeviceId: jest.fn().mockResolvedValue('device-1') },
}));
jest.mock('../env', () => ({ env: { API_BASE_URL: 'https://api.test' } }));
jest.mock('../auth/token-expiry', () => ({
  // Default: token is fresh, so request() does NOT proactively refresh.
  isTokenExpiredOrExpiring: jest.fn(() => false),
}));
jest.mock('./request-policy', () => ({ policyFetch: jest.fn() }));

import {
  tryRefresh,
  apiGet,
  setAccessToken,
  registerAuthFailureHandler,
} from './api-client';
import { tokenStore } from '../auth/token-store';
import { policyFetch } from './request-policy';

const storedUser = {
  id: 'u1',
  fullName: 'Test User',
  email: 'test@example.com',
  phoneNumber: '+919876543210',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
};

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  };
}

/** Make getSession reflect clearSession (mock clearSession actually clears). */
function setStoredSession(refreshToken: string | null) {
  let stored = refreshToken ? { refreshToken, user: storedUser } : null;
  (tokenStore.getSession as jest.Mock).mockImplementation(() => Promise.resolve(stored));
  (tokenStore.clearSession as jest.Mock).mockImplementation(() => {
    stored = null;
    return Promise.resolve();
  });
}

const originalFetch = globalThis.fetch;

describe('api-client auth lifecycle', () => {
  let unregister: () => void;
  let onAuthFailure: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
    onAuthFailure = jest.fn();
    unregister = registerAuthFailureHandler(onAuthFailure);
  });

  afterEach(() => {
    unregister();
    globalThis.fetch = originalFetch;
  });

  describe('tryRefresh', () => {
    it('DEFINITIVE revoke (401): clears the session and signals logout', async () => {
      setStoredSession('r-old');
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes(401, {})) as unknown as typeof fetch;

      const token = await tryRefresh();

      expect(token).toBeNull();
      expect(tokenStore.clearSession).toHaveBeenCalledTimes(1);
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });

    it('TRANSIENT failure (503): keeps the session and does NOT signal logout', async () => {
      setStoredSession('r-old');
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes(503, {})) as unknown as typeof fetch;

      const token = await tryRefresh();

      expect(token).toBeNull();
      expect(tokenStore.clearSession).not.toHaveBeenCalled();
      expect(onAuthFailure).not.toHaveBeenCalled();
    });

    it('NETWORK error: keeps the session and does NOT signal logout', async () => {
      setStoredSession('r-old');
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

      const token = await tryRefresh();

      expect(token).toBeNull();
      expect(tokenStore.clearSession).not.toHaveBeenCalled();
      expect(onAuthFailure).not.toHaveBeenCalled();
    });

    it('SUCCESS: returns the new token and persists the stored user with a fresh ACTIVE status', async () => {
      setStoredSession('r-old');
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonRes(200, { data: { accessToken: 'access-new', refreshToken: 'r-new', user: { role: 'OWNER' } } }),
        ) as unknown as typeof fetch;

      const token = await tryRefresh();

      expect(token).toBe('access-new');
      expect(tokenStore.setSession).toHaveBeenCalledWith('r-new', expect.objectContaining({ status: 'ACTIVE' }));
      expect(onAuthFailure).not.toHaveBeenCalled();
    });
  });

  describe('request() on a 401 when refresh cannot recover', () => {
    it('TRANSIENT refresh failure with the session still stored → NETWORK error, NO logout', async () => {
      setStoredSession('r-old');
      setAccessToken('access-stale');
      (policyFetch as jest.Mock).mockResolvedValue(jsonRes(401, null));
      // tryRefresh itself fails transiently (5xx) → session preserved.
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes(503, {})) as unknown as typeof fetch;

      const res = await apiGet('/anything');

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('NETWORK');
      expect(onAuthFailure).not.toHaveBeenCalled();
    });

    it('DEFINITIVE refresh revoke (session cleared) → UNAUTHORIZED and logout signalled', async () => {
      setStoredSession('r-old');
      setAccessToken('access-stale');
      (policyFetch as jest.Mock).mockResolvedValue(jsonRes(401, null));
      // tryRefresh gets a 401 → clears the session + signals logout.
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes(401, {})) as unknown as typeof fetch;

      const res = await apiGet('/anything');

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('UNAUTHORIZED');
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });
  });
});
