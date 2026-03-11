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

export function registerAuthFailureHandler(handler: () => void): void {
  _onAuthFailure = handler;
}

export const accessTokenStore = {
  set: setAccessToken,
  get: getAccessToken,
};

let _refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  // Deduplicate concurrent refresh calls — all callers share the same promise
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const session = await tokenStore.getSession();
    if (!session) return null;

    const deviceId = await deviceIdStore.getDeviceId();
    const userId = session.user.id;

    try {
      const res = await fetch(`${env.API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken, deviceId, userId }),
      });

      if (!res.ok) return null;

      const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
      const data = json.data;

      _accessToken = data.accessToken;
      await tokenStore.setSession(data.refreshToken, session.user);

      return data.accessToken;
    } catch {
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
  // Proactively refresh if the token is expired or about to expire
  if (_accessToken && isTokenExpiredOrExpiring(_accessToken) && !retried) {
    await tryRefresh();
  }

  const url = `${env.API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': generateRequestId(),
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  try {
    const res = await policyFetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !retried) {
      const newToken = await tryRefresh();
      if (newToken) {
        return request<T>(method, path, body, true);
      }
      _onAuthFailure?.();
      return err({ code: 'UNAUTHORIZED', message: 'Session expired' });
    }

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      return err(mapHttpError(res.status, json));
    }

    const json = (await res.json()) as { data: T };
    return ok(json.data);
  } catch {
    return err({ code: 'NETWORK', message: 'Network error. Please check your connection.' });
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
