import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  RefreshResponse,
  AcademySetupRequest,
  AcademySetupResponse,
  PasswordResetRequestInput,
  PasswordResetConfirmInput,
  PasswordResetResponse,
} from '../../domain/auth/auth.types';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import type { AuthApiPort } from '../../application/auth/ports';
import { ok, err } from '../../domain/common/result';
import { mapHttpError } from '../http/error-mapper';
import { env } from '../env';

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

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

  confirmPasswordReset(req: PasswordResetConfirmInput) {
    return post<PasswordResetResponse>('/api/v1/auth/password-reset/confirm', req);
  },
};
