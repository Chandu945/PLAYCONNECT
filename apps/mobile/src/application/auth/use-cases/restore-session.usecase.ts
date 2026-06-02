import type { AuthUser } from '../../../domain/auth/auth.types';
import type { AppError } from '../../../domain/common/errors';
import type { Result } from '../../../domain/common/result';
import type { TokenStorePort, AccessTokenPort, TokenRefresherPort } from '../ports';

export type RestoreResult = { user: AuthUser; accessToken: string };

export type RestoreSessionDeps = {
  tokenStore: TokenStorePort;
  accessToken: AccessTokenPort;
  tokenRefresher: TokenRefresherPort;
};

export async function restoreSessionUseCase(
  deps: RestoreSessionDeps,
): Promise<Result<RestoreResult, AppError>> {
  const session = await deps.tokenStore.getSession();
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'No stored session' } };
  }

  const newToken = await deps.tokenRefresher.tryRefresh();

  if (!newToken) {
    // tryRefresh clears the stored session itself ONLY on a definitive server
    // revoke (401/403). On a transient failure (offline / 5xx) it preserves the
    // session, so we must NOT clear it here — the user stays logged in and is
    // restored on the next launch / reconnect rather than being forced to
    // re-login because of a network hiccup.
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
  }

  // Defence-in-depth: a server-deactivated account fails the refresh above
  // (canLogin → 401/403, session cleared). This local guard additionally blocks
  // a stored INACTIVE status; tryRefresh now keeps that status fresh on success.
  if (session.user.status === 'INACTIVE') {
    await deps.tokenStore.clearSession();
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Account is inactive' } };
  }

  return {
    ok: true,
    value: { user: session.user, accessToken: newToken },
  };
}
