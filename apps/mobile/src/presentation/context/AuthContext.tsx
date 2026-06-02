import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { AuthUser, AcademySetupRequest } from '../../domain/auth/auth.types';
import type { SubscriptionInfo } from '../../domain/subscription/subscription.types';
import type { AppError } from '../../domain/common/errors';
import type { SignupInput } from '../../application/auth/use-cases/owner-signup.usecase';
import { loginUseCase } from '../../application/auth/use-cases/login.usecase';
import { ownerSignupUseCase } from '../../application/auth/use-cases/owner-signup.usecase';
import { setupAcademyUseCase } from '../../application/auth/use-cases/setup-academy.usecase';
import { restoreSessionUseCase } from '../../application/auth/use-cases/restore-session.usecase';
import { logoutUseCase } from '../../application/auth/use-cases/logout.usecase';
import { getMySubscriptionUseCase } from '../../application/subscription/use-cases/get-my-subscription.usecase';
import { authApi } from '../../infra/auth/auth-api';
import { tokenStore } from '../../infra/auth/token-store';
import { deviceIdStore } from '../../infra/auth/device-id';
import { subscriptionApi } from '../../infra/subscription/subscription-api';
import { pushTokenApi } from '../../infra/notification/push-token-api';
import { accessTokenStore, getAccessToken, registerAuthFailureHandler, tryRefresh } from '../../infra/http/api-client';
import { getFcmToken } from '../../infra/notification/firebase-messaging';
import { isTokenExpiredOrExpiring } from '../../infra/auth/token-expiry';
import { checkAppVersionUseCase } from '../../application/auth/use-cases/check-app-version.usecase';
import { APP_VERSION, APP_PLATFORM } from '../../infra/app-version';
import { env } from '../../infra/env';
import { clearAttendanceSummaryCache } from '../components/dashboard/AttendanceSummaryWidget';
import { clearMonthlyChartCache } from '../components/dashboard/MonthlyChartWidget';
import { invalidateBatchCache } from '../../infra/batch/batch-cache';

export type AuthPhase =
  | 'initializing'
  | 'updateRequired'
  | 'unauthenticated'
  | 'needsAcademySetup'
  | 'blocked'
  | 'ready';

export type ForceUpdateInfo = {
  storeUrl: string;
  minVersion: string;
};

export type AuthState = {
  phase: AuthPhase;
  user: AuthUser | null;
  subscription: SubscriptionInfo | null;
  forceUpdate: ForceUpdateInfo | null;
  /** Set when the session was invalidated server-side (401 past refresh) —
   *  differentiates a forced sign-out from a manual logout so the UI can
   *  show a "Session expired" prompt instead of the bare login screen. */
  sessionExpired: boolean;
};

type AuthActions = {
  login: (identifier: string, password: string) => Promise<AppError | null>;
  signup: (input: SignupInput) => Promise<AppError | null>;
  setupAcademy: (input: AcademySetupRequest) => Promise<AppError | null>;
  logout: () => Promise<void>;
  refreshSubscription: () => Promise<SubscriptionInfo | null>;
  dismissSessionExpired: () => void;
};

export type AuthContextValue = AuthState & AuthActions;

const defaultContext: AuthContextValue = {
  phase: 'initializing',
  user: null,
  subscription: null,
  forceUpdate: null,
  sessionExpired: false,
  login: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  signup: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  setupAcademy: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  logout: async () => {},
  refreshSubscription: async () => null,
  dismissSessionExpired: () => {},
};

export const AuthContext = createContext<AuthContextValue>(defaultContext);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// Module-scope singletons — acceptable because these are stateless adapters.
// For testability, inject via AuthProvider props in test harness.
const deps = {
  authApi,
  tokenStore,
  deviceId: deviceIdStore,
  accessToken: accessTokenStore,
  pushTokenApi,
  tokenRefresher: { tryRefresh },
  pushTokenProvider: { getCurrentToken: getFcmToken },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    phase: 'initializing',
    user: null,
    subscription: null,
    forceUpdate: null,
    sessionExpired: false,
  });
  const mountedRef = useRef(true);

  // Deps are empty: mountedRef/setState are stable; subscriptionApi is a module-scope singleton.
  const resolvePhase = useCallback(async (user: AuthUser): Promise<SubscriptionInfo | null> => {
    // Parents skip subscription check — go directly to ready
    if (user.role === 'PARENT') {
      if (mountedRef.current) {
        setState({ phase: 'ready', user, subscription: null, forceUpdate: null, sessionExpired: false });
      }
      return null;
    }

    const subResult = await getMySubscriptionUseCase({
      subscriptionApi,
    });

    if (!mountedRef.current) return null;

    if (!subResult.ok) {
      if (subResult.error.code === 'CONFLICT' || subResult.error.code === 'ACADEMY_SETUP_REQUIRED') {
        setState({ phase: 'needsAcademySetup', user, subscription: null, forceUpdate: null, sessionExpired: false });
      } else if (subResult.error.code === 'UNAUTHORIZED' || subResult.error.code === 'FORBIDDEN') {
        setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: true });
      } else {
        // Transient error — let user proceed, subscription will be rechecked later
        setState({ phase: 'ready', user, subscription: null, forceUpdate: null, sessionExpired: false });
      }
      return null;
    }

    const sub = subResult.value;
    if (!sub.canAccessApp) {
      setState({ phase: 'blocked', user, subscription: sub, forceUpdate: null, sessionExpired: false });
    } else {
      setState({ phase: 'ready', user, subscription: sub, forceUpdate: null, sessionExpired: false });
    }
    return sub;
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await logoutUseCase(deps);
    } catch (e) {
      if (__DEV__) console.warn('[AuthContext] Logout use case failed (proceeding anyway):', e);
    }
    // Clear cached dashboard data to prevent cross-user data leak. Batch
    // list was previously missed — next tenant's BatchMultiSelect would
    // briefly render the prior tenant's batch names.
    clearAttendanceSummaryCache();
    clearMonthlyChartCache();
    invalidateBatchCache();
    // Always transition to unauthenticated regardless of errors above
    if (mountedRef.current) {
      // Manual logout — skip the session-expired prompt.
      setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: false });
    }
  }, []);

  const dismissSessionExpired = useCallback(() => {
    if (!mountedRef.current) return;
    setState((prev) => (prev.sessionExpired ? { ...prev, sessionExpired: false } : prev));
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const unregisterAuthFailure = registerAuthFailureHandler(() => {
      if (mountedRef.current) {
        // Server-side invalidation — flag as session-expired so the UI can
        // show the "Session expired" sheet on top of the login screen.
        setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: true });
      }
    });

    (async () => {
      // Version gate is native-only — the web build auto-refreshes on deploy,
      // so we skip the server check to avoid a 400 from the android/ios-only
      // validator. Native apps still enforce the min version.
      const versionCheck = APP_PLATFORM === 'web'
        ? null
        : await checkAppVersionUseCase({
            apiBaseUrl: env.API_BASE_URL,
            appVersion: APP_VERSION,
            platform: APP_PLATFORM,
          });
      if (!mountedRef.current) return;
      if (versionCheck?.updateRequired) {
        setState({
          phase: 'updateRequired',
          user: null,
          subscription: null,
          forceUpdate: { storeUrl: versionCheck.storeUrl, minVersion: versionCheck.minVersion },
          sessionExpired: false,
        });
        return;
      }

      const result = await restoreSessionUseCase(deps);
      if (!mountedRef.current) return;

      if (!result.ok) {
        // No stored session at boot — treat as normal unauthenticated, not expired.
        setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: false });
        return;
      }

      await resolvePhase(result.value.user);
    })().catch(() => {
      if (mountedRef.current) {
        setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: false });
      }
    });

    return () => {
      mountedRef.current = false;
      unregisterAuthFailure();
    };
  }, [resolvePhase]);

  // When the app returns from background: (a) silently refresh the access
  // token so the user isn't forced to re-login, and (b) re-evaluate
  // subscription so a mid-session flip (owner paid, admin deactivated, trial
  // expired) flows the user into the right navigation stack both directions.
  //
  // BUG-031: this is native-only. On web, AppState 'active' fires on every
  // browser tab/window focus change (DevTools toggle, alt-tab, clicking back
  // into the page) and each one triggers a /subscription/me round-trip — we
  // observed 3 redundant calls in a normal QA session. The web build
  // reloads on deploy and has no real "background" state to worry about, so
  // skipping the listener entirely is safe.
  useEffect(() => {
    if (APP_PLATFORM === 'web') return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (!mountedRef.current) return;

      const token = getAccessToken();
      const needsTokenRefresh = !token || isTokenExpiredOrExpiring(token);
      const isSubscriptionSensitivePhase =
        state.phase === 'ready' || state.phase === 'blocked';

      if (state.phase === 'ready' && needsTokenRefresh) {
        // Access token was lost or expired/expiring — silently restore then
        // resolve phase (which does the full subscription recheck).
        restoreSessionUseCase(deps)
          .then(async (result) => {
            if (!mountedRef.current) return;
            if (!result.ok) {
              // Only sign the user out if the session was actually revoked.
              // restore-session/tryRefresh clear the stored session ONLY on a
              // definitive server revoke; on a transient failure (offline / 5xx)
              // the session is preserved — keep the user signed in and just drop
              // the stale access token so a later call retries the refresh.
              const session = await tokenStore.getSession();
              if (!session) {
                setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: true });
              } else {
                accessTokenStore.set(null);
              }
              return;
            }
            if (state.user) {
              // Canonical phase resolution — correctly handles both
              // ready→blocked (sub expired) and blocked→ready (admin reactivated).
              await resolvePhase(state.user);
            }
          })
          .catch(async (err) => {
            if (__DEV__) console.warn(
              '[AuthContext] Background token refresh failed:',
              err instanceof Error ? err.message : 'unknown',
            );
            if (!mountedRef.current) return;
            // If the stored session was already cleared (permanent auth failure),
            // transition to unauthenticated immediately instead of waiting for the next API call
            const session = await tokenStore.getSession();
            if (!session) {
              setState({ phase: 'unauthenticated', user: null, subscription: null, forceUpdate: null, sessionExpired: true });
            } else {
              accessTokenStore.set(null);
            }
          });
      } else if (isSubscriptionSensitivePhase && state.user) {
        // Token still fresh but we may have missed a subscription flip
        // while the app was backgrounded. Re-resolve cheaply.
        resolvePhase(state.user).catch(() => { /* best-effort */ });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [state.phase, state.user, resolvePhase]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<AppError | null> => {
      const result = await loginUseCase(identifier, password, deps);
      if (!result.ok) return result.error;
      await resolvePhase(result.value.user);
      return null;
    },
    [resolvePhase],
  );

  const signup = useCallback(async (input: SignupInput): Promise<AppError | null> => {
    const result = await ownerSignupUseCase(input, deps);
    if (!result.ok) return result.error;
    setState({ phase: 'needsAcademySetup', user: result.value.user, subscription: null, forceUpdate: null, sessionExpired: false });
    return null;
  }, []);

  const setupAcademy = useCallback(
    async (input: AcademySetupRequest): Promise<AppError | null> => {
      const result = await setupAcademyUseCase(input, {
        authApi,
        accessToken: accessTokenStore,
      });
      if (!result.ok) return result.error;
      if (state.user) {
        await resolvePhase(state.user);
      }
      return null;
    },
    [state.user, resolvePhase],
  );

  const refreshSubscription = useCallback(async () => {
    if (!state.user) return null;
    return resolvePhase(state.user);
  }, [state.user, resolvePhase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      signup,
      setupAcademy,
      logout: doLogout,
      refreshSubscription,
      dismissSessionExpired,
    }),
    [state, login, signup, setupAcademy, doLogout, refreshSubscription, dismissSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
