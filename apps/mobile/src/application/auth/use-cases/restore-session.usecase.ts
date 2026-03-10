import type { AuthUser } from '../../../domain/auth/auth.types';
import type { AppError } from '../../../domain/common/errors';
import type { Result } from '../../../domain/common/result';
import type { AuthApiPort, TokenStorePort, DeviceIdPort, AccessTokenPort } from '../ports';

export type RestoreResult = { user: AuthUser; accessToken: string };

export type RestoreSessionDeps = {
  authApi: AuthApiPort;
  tokenStore: TokenStorePort;
  deviceId: DeviceIdPort;
  accessToken: AccessTokenPort;
};

export async function restoreSessionUseCase(
  deps: RestoreSessionDeps,
): Promise<Result<RestoreResult, AppError>> {
  const session = await deps.tokenStore.getSession();
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'No stored session' } };
  }

  const deviceId = await deps.deviceId.getDeviceId();
  const userId = session.user.id;
  const result = await deps.authApi.refresh(session.refreshToken, deviceId, userId);

  if (!result.ok) {
    await deps.tokenStore.clearSession();
    return result;
  }

  await deps.tokenStore.setSession(result.value.refreshToken, session.user);
  deps.accessToken.set(result.value.accessToken);

  return {
    ok: true,
    value: { user: session.user, accessToken: result.value.accessToken },
  };
}
