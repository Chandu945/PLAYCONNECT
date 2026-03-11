'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AcademiesListResult, AcademiesQuery } from '@/domain/admin/academies';
import type { AppError } from '@/domain/common/errors';
import { useAdminAuth } from '@/application/auth/use-admin-auth';
import * as academiesService from './academies.service';

type UseAcademiesReturn = {
  data: AcademiesListResult | null;
  loading: boolean;
  error: AppError | null;
  refetch: () => void;
};

export function useAcademies(query: AcademiesQuery): UseAcademiesReturn {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState<AcademiesListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  // Serialize query to a stable string for effect dependency
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await academiesService.listAcademies(query, token);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, accessToken, fetchCount]);

  return { data, loading, error, refetch };
}
