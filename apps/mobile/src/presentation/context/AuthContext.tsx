import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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
import { accessTokenStore, getAccessToken, registerAuthFailureHandler } from '../../infra/http/api-client';
import { isTokenExpiredOrExpiring } from '../../infra/auth/token-expiry';

export type AuthPhase =
  | 'initializing'
  | 'unauthenticated'
  | 'needsAcademySetup'
  | 'blocked'
  | 'ready';

export type AuthState = {
  phase: AuthPhase;
  user: AuthUser | null;
  subscription: SubscriptionInfo | null;
};

type AuthActions = {
  login: (identifier: string, password: string) => Promise<AppError | null>;
  signup: (input: SignupInput) => Promise<AppError | null>;
  setupAcademy: (input: AcademySetupRequest) => Promise<AppError | null>;
  logout: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
};

export type AuthContextValue = AuthState & AuthActions;

const defaultContext: AuthContextValue = {
  phase: 'initializing',
  user: null,
  subscription: null,
  login: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  signup: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  setupAcademy: async () => ({ code: 'UNKNOWN', message: 'Not ready' }),
  logout: async () => {},
  refreshSubscription: async () => {},
};

export const AuthContext = createContext<AuthContextValue>(defaultContext);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

const deps = {
  authApi,
  tokenStore,
  deviceId: deviceIdStore,
  accessToken: accessTokenStore,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    phase: 'initializing',
    user: null,
    subscription: null,
  });
  const mountedRef = useRef(true);

  const resolvePhase = useCallback(async (user: AuthUser): Promise<void> => {
    // Parents skip subscription check — go directly to ready
    if (user.role === 'PARENT') {
      if (mountedRef.current) {
        setState({ phase: 'ready', user, subscription: null });
      }
      return;
    }

    const subResult = await getMySubscriptionUseCase({
      subscriptionApi,
      accessToken: accessTokenStore,
    });

    if (!mountedRef.current) return;

    if (!subResult.ok) {
      if (subResult.error.code === 'CONFLICT') {
        setState({ phase: 'needsAcademySetup', user, subscription: null });
      } else {
        setState({ phase: 'unauthenticated', user: null, subscription: null });
      }
      return;
    }

    const sub = subResult.value;
    if (!sub.canAccessApp) {
      setState({ phase: 'blocked', user, subscription: sub });
    } else {
      setState({ phase: 'ready', user, subscription: sub });
    }
  }, []);

  const doLogout = useCallback(async () => {
    await logoutUseCase(deps);
    if (mountedRef.current) {
      setState({ phase: 'unauthenticated', user: null, subscription: null });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    registerAuthFailureHandler(() => {
      setState({ phase: 'unauthenticated', user: null, subscription: null });
    });

    (async () => {
      const result = await restoreSessionUseCase(deps);
      if (!mountedRef.current) return;

      if (!result.ok) {
        setState({ phase: 'unauthenticated', user: null, subscription: null });
        return;
      }

      await resolvePhase(result.value.user);
    })().catch(() => {
      if (mountedRef.current) {
        setState({ phase: 'unauthenticated', user: null, subscription: null });
      }
    });

    return () => {
      mountedRef.current = false;
    };
  }, [resolvePhase]);

  // When app returns from background, silently re-refresh the access token
  // so the user is never forced to re-login after backgrounding
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const token = getAccessToken();
      const needsRefresh = !token || isTokenExpiredOrExpiring(token);
      if (nextState === 'active' && state.phase === 'ready' && needsRefresh) {
        // Access token was lost or expired/expiring — silently restore
        restoreSessionUseCase(deps)
          .then((result) => {
            if (!mountedRef.current) return;
            if (!result.ok) {
              setState({ phase: 'unauthenticated', user: null, subscription: null });
            }
            // Token is now refreshed in-memory via restoreSessionUseCase
          })
          .catch(() => {
            // Token refresh failed silently — user will need to re-login on next API call
          });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [state.phase]);

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
    setState({ phase: 'needsAcademySetup', user: result.value.user, subscription: null });
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
    if (!state.user) return;
    await resolvePhase(state.user);
  }, [state.user, resolvePhase]);

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
    setupAcademy,
    logout: doLogout,
    refreshSubscription,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
