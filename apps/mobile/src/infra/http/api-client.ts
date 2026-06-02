import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import { ok, err } from '../../domain/common/result';
import { mapHttpError } from './error-mapper';
import { generateRequestId } from './request-id';
import { policyFetch } from './request-policy';
import { tokenStore } from '../auth/token-store';
import { deviceIdStore } from '../auth/device-id';
import { isTokenExpiredOrExpiring } from '../auth/token-expiry';
import { env } from '../env';

let _accessToken: string | null = null;
let _onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function registerAuthFailureHandler(handler: () => void): () => void {
  _onAuthFailure = handler;
  return () => {
    if (_onAuthFailure === handler) {
      _onAuthFailure = null;
    }
  };
}

export const accessTokenStore = {
  set: setAccessToken,
  get: getAccessToken,
};

let _refreshPromise: Promise<string | null> | null = null;

export async function tryRefresh(): Promise<string | null> {
  // Deduplicate concurrent refresh calls — all callers share the same promise
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const session = await tokenStore.getSession();
    if (!session) return null;

    const deviceId = await deviceIdStore.getDeviceId();
    const userId = session.user.id;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      let res: Response;
      try {
        res = await fetch(`${env.API_BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken, deviceId, userId }),
          signal: controller.signal,
        });
      } finally {
        // Always clear the abort timer — including when fetch throws (network
        // error / abort) — so it doesn't leak for the full 30s.
        clearTimeout(timer);
      }

      if (!res.ok) {
        // Only a DEFINITIVE server revoke ends the session. The refresh endpoint
        // returns 401/403 solely for a genuinely revoked/expired session, token
        // reuse beyond the rotation grace, or a disabled/deactivated account —
        // i.e. the deliberate events (logout-all, password reset, admin
        // force-logout, academy disable, deactivation). For those we clear the
        // stored session and signal logout here (the single owner of that
        // decision). Transient failures (5xx, 429, …) keep the session so the
        // user is never logged out automatically by a hiccup.
        if (res.status === 401 || res.status === 403) {
          await tokenStore.clearSession();
          _accessToken = null;
          _onAuthFailure?.();
        }
        return null;
      }

      const json = (await res.json()) as { data: { accessToken: string; refreshToken: string; user?: Record<string, unknown> } };
      const data = json.data;

      _accessToken = data.accessToken;
      const updatedUser = data.user
        ? {
            ...session.user,
            fullName: (data.user['fullName'] as string) ?? session.user.fullName,
            email: (data.user['email'] as string) ?? session.user.email,
            phoneNumber: (data.user['phoneNumber'] as string) ?? session.user.phoneNumber,
            profilePhotoUrl: data.user['profilePhotoUrl'] as string | null | undefined ?? session.user.profilePhotoUrl,
            // Role can change server-side (e.g., OWNER→STAFF demotion). Server-side RBAC
            // stays correct via the fresh JWT, but the UI reads from the keychain copy —
            // update it too so nav/permission-gated screens don't drift.
            role: (data.user['role'] as typeof session.user.role) ?? session.user.role,
          }
        : session.user;
      // A successful refresh means the server re-checked canLogin, so the
      // account is active. Keep the stored status fresh — the cold-start
      // INACTIVE guard previously acted on a value that refresh never updated.
      const refreshedUser = { ...updatedUser, status: 'ACTIVE' as const };
      await tokenStore.setSession(data.refreshToken, refreshedUser);

      return data.accessToken;
    } catch {
      // Network error — return null but DON'T clear session (transient failure)
      return null;
    }
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<Result<T, AppError>> {
  // Proactively refresh if the token is expired or about to expire.
  // If refresh fails (returns null) we still attempt the call with whatever
  // token we have — the server-side 401 path below handles the final cleanup.
  if (_accessToken && isTokenExpiredOrExpiring(_accessToken) && !retried) {
    await tryRefresh();
  }

  const url = `${env.API_BASE_URL}${path}`;
  const requestId = generateRequestId();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'X-Request-Id': requestId,
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  try {
    const res = await policyFetch(url, {
      method,
      headers,
      body: isFormData ? (body as BodyInit) : (body !== undefined ? JSON.stringify(body) : undefined),
    });

    if (res.status === 401 && !retried) {
      // tryRefresh is deduplicated module-wide — concurrent 401s share one refresh round-trip.
      // We rely on the returned token (rather than re-reading _accessToken) so that if
      // the refresh returns an empty/expired token we short-circuit instead of looping.
      const newToken = await tryRefresh();
      if (newToken && !isTokenExpiredOrExpiring(newToken)) {
        return request<T>(method, path, body, true);
      }
      // tryRefresh ALREADY clears the stored session and signals logout iff the
      // failure was a definitive server revoke. Do NOT independently force a
      // logout here. Distinguish the two outcomes by the AUTHORITATIVE signal —
      // whether the stored session still exists — rather than _accessToken,
      // which AuthContext may have transiently nulled on a prior hiccup. A
      // transient failure (offline / 5xx) keeps the session, so the user stays
      // signed in and can simply retry.
      const sessionStillStored = (await tokenStore.getSession()) !== null;
      if (!sessionStillStored) {
        return err({ code: 'UNAUTHORIZED', message: 'Session expired' });
      }
      return err({
        code: 'NETWORK',
        message: 'Unable to refresh your session. Please check your connection and try again.',
      });
    }

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const serverRequestId = res.headers.get('x-request-id') ?? requestId;
      if (__DEV__) {
        console.warn(`[api-client] ${method} ${path} ${res.status} requestId=${serverRequestId}`);
      }
      return err(
        mapHttpError(res.status, json, res.headers.get('retry-after'), serverRequestId),
      );
    }

    if (res.status === 204) return ok(undefined as T);

    const json = (await res.json()) as { data: T };
    return ok(json.data);
  } catch {
    if (__DEV__) {
      console.warn(`[api-client] ${method} ${path} network error requestId=${requestId}`);
    }
    return err({
      code: 'NETWORK',
      message: 'Network error. Please check your connection.',
      requestId,
    });
  }
}

export function apiGet<T>(path: string): Promise<Result<T, AppError>> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<Result<T, AppError>> {
  return request<T>('POST', path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<Result<T, AppError>> {
  return request<T>('PUT', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<Result<T, AppError>> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T>(path: string): Promise<Result<T, AppError>> {
  return request<T>('DELETE', path);
}
