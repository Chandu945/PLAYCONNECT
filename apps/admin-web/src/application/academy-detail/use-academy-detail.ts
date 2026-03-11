'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  AdminAcademyDetail,
  ManualSubscriptionInput,
  ResetPasswordResult,
} from '@/domain/admin/academy-detail';
import type { AppError } from '@/domain/common/errors';
import { useAdminAuth } from '@/application/auth/use-admin-auth';
import * as detailService from './academy-detail.service';
import * as actionsService from './academy-actions.service';

type ActionResult = { ok: true } | { ok: false; error: AppError };

type AcademyActions = {
  setManualSubscription: (input: ManualSubscriptionInput) => Promise<ActionResult>;
  deactivateSubscription: () => Promise<ActionResult>;
  setLoginDisabled: (disabled: boolean) => Promise<ActionResult>;
  forceLogout: () => Promise<ActionResult>;
  resetOwnerPassword: (
    temporaryPassword?: string,
  ) => Promise<{ ok: true; data: ResetPasswordResult } | { ok: false; error: AppError }>;
};

type UseAcademyDetailReturn = {
  data: AdminAcademyDetail | null;
  loading: boolean;
  error: AppError | null;
  refetch: () => void;
  actions: AcademyActions;
};

export function useAcademyDetail(academyId: string): UseAcademyDetailReturn {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState<AdminAcademyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => setFetchCount((c) => c + 1), []);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await detailService.getDetail(academyId, token);

      if (cancelled) return;

      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error);
        if (result.error.code === 'UNAUTHORIZED') {
          window.location.href = '/login';
          return;
        }
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [academyId, accessToken, fetchCount]);

  const actions = useMemo<AcademyActions>(
    () => ({
      setManualSubscription: async (input: ManualSubscriptionInput) => {
        const result = await actionsService.setManualSubscription(
          academyId,
          input,
          accessToken ?? undefined,
        );
        if (result.ok) refetch();
        else if (result.error.code === 'UNAUTHORIZED') window.location.href = '/login';
        return result;
      },
      deactivateSubscription: async () => {
        const result = await actionsService.deactivateSubscription(
          academyId,
          accessToken ?? undefined,
        );
        if (result.ok) refetch();
        else if (result.error.code === 'UNAUTHORIZED') window.location.href = '/login';
        return result;
      },
      setLoginDisabled: async (disabled: boolean) => {
        const result = await actionsService.setLoginDisabled(
          academyId,
          disabled,
          accessToken ?? undefined,
        );
        if (result.ok) refetch();
        else if (result.error.code === 'UNAUTHORIZED') window.location.href = '/login';
        return result;
      },
      forceLogout: async () => {
        const result = await actionsService.forceLogout(academyId, accessToken ?? undefined);
        if (result.ok) refetch();
        else if (result.error.code === 'UNAUTHORIZED') window.location.href = '/login';
        return result;
      },
      resetOwnerPassword: async (temporaryPassword?: string) => {
        const result = await actionsService.resetOwnerPassword(
          academyId,
          temporaryPassword,
          accessToken ?? undefined,
        );
        if (!result.ok && result.error.code === 'UNAUTHORIZED') window.location.href = '/login';
        return result;
      },
    }),
    [academyId, accessToken, refetch],
  );

  return { data, loading, error, refetch, actions };
}
