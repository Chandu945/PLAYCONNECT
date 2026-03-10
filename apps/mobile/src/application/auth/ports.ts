import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  AcademySetupRequest,
  AcademySetupResponse,
  RefreshResponse,
  AuthUser,
  PasswordResetRequestInput,
  PasswordResetConfirmInput,
  PasswordResetResponse,
} from '../../domain/auth/auth.types';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';

export interface AuthApiPort {
  login(req: LoginRequest): Promise<Result<AuthResponse, AppError>>;
  ownerSignup(req: SignupRequest): Promise<Result<AuthResponse, AppError>>;
  refresh(refreshToken: string, deviceId: string, userId: string): Promise<Result<RefreshResponse, AppError>>;
  logout(accessToken: string, deviceId: string): Promise<Result<void, AppError>>;
  setupAcademy(
    req: AcademySetupRequest,
    accessToken: string,
  ): Promise<Result<AcademySetupResponse, AppError>>;
  requestPasswordReset(
    req: PasswordResetRequestInput,
  ): Promise<Result<PasswordResetResponse, AppError>>;
  confirmPasswordReset(
    req: PasswordResetConfirmInput,
  ): Promise<Result<PasswordResetResponse, AppError>>;
}

export interface TokenStorePort {
  getSession(): Promise<{ refreshToken: string; user: AuthUser } | null>;
  setSession(refreshToken: string, user: AuthUser): Promise<void>;
  clearSession(): Promise<void>;
}

export interface DeviceIdPort {
  getDeviceId(): Promise<string>;
}

export interface AccessTokenPort {
  set(token: string | null): void;
  get(): string | null;
}
