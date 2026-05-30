import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  RefreshResponse,
  AcademySetupRequest,
  AcademySetupResponse,
  PasswordResetRequestInput,
  PasswordResetVerifyInput,
  PasswordResetConfirmInput,
  PasswordResetResponse,
} from '../../domain/auth/auth.types';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import type { AuthApiPort } from '../../application/auth/ports';
import { ok, err } from '../../domain/common/result';
import { mapHttpError } from '../http/error-mapper';
import { env } from '../env';

const AUTH_TIMEOUT_MS = 30_000;
const AUTH_RETRY_BACKOFF_MS = 2_000;

async function attemptPost<T>(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Result<T, AppError>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      // Pass the Retry-After header so a rate-limited login/signup/reset shows
      // the server's real cooldown (up to 15 min) instead of the hardcoded 30s
      // fallback. Mirrors api-client.ts.
      return err(
        mapHttpError(
          res.status,
          json,
          res.headers.get('retry-after'),
          res.headers.get('x-request-id'),
        ),
      );
    }

    const json = (await res.json()) as { data: T };
    return ok(json.data);
  } catch {
    clearTimeout(timer);
    return err({ code: 'NETWORK', message: 'Unable to connect. Please check your internet connection and try again.' });
  }
}

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<Result<T, AppError>> {
  const url = `${env.API_BASE_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const serialized = JSON.stringify(body);
  const result = await attemptPost<T>(url, headers, serialized);

  // Retry once on network error (auth POSTs are safe to retry — backend revokes old sessions)
  if (!result.ok && result.error.code === 'NETWORK') {
    await new Promise<void>((r) => setTimeout(r, AUTH_RETRY_BACKOFF_MS));
    return attemptPost<T>(url, headers, serialized);
  }

  return result;
}

export const authApi: AuthApiPort = {
  login(req: LoginRequest) {
    return post<AuthResponse>('/api/v1/auth/login', req);
  },

  ownerSignup(req: SignupRequest) {
    return post<AuthResponse>('/api/v1/auth/owner/signup', req);
  },

  refresh(refreshToken: string, deviceId: string, userId: string) {
    return post<RefreshResponse>('/api/v1/auth/refresh', { refreshToken, deviceId, userId });
  },

  logout(accessToken: string, deviceId: string) {
    return post<void>('/api/v1/auth/logout', { deviceId }, accessToken);
  },

  setupAcademy(req: AcademySetupRequest, accessToken: string) {
    return post<AcademySetupResponse>('/api/v1/academy/setup', req, accessToken);
  },

  requestPasswordReset(req: PasswordResetRequestInput) {
    return post<PasswordResetResponse>('/api/v1/auth/password-reset/request', req);
  },

  verifyPasswordReset(req: PasswordResetVerifyInput) {
    return post<PasswordResetResponse>('/api/v1/auth/password-reset/verify', req);
  },

  confirmPasswordReset(req: PasswordResetConfirmInput) {
    return post<PasswordResetResponse>('/api/v1/auth/password-reset/confirm', req);
  },

  googleLogin(idToken: string, deviceId: string) {
    return post<AuthResponse>('/api/v1/auth/google', { idToken, deviceId });
  },
};
