'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AdminDashboardCounts } from '@/domain/admin/dashboard';
import type { AppError } from '@/domain/common/errors';
import { useAdminAuth } from '@/application/auth/use-admin-auth';
import * as dashboardService from './admin-dashboard.service';

type UseAdminDashboardReturn = {
  data: AdminDashboardCounts | null;
  loading: boolean;
  error: AppError | null;
  refetch: () => void;
};

export function useAdminDashboard(): UseAdminDashboardReturn {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState<AdminDashboardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await dashboardService.getDashboard(token);

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
  }, [accessToken, fetchCount]);

  return { data, loading, error, refetch };
}
