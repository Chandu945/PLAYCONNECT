'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AuditLogsResult, AuditLogsQuery } from '@/domain/admin/audit-logs';
import type { AppError } from '@/domain/common/errors';
import { useAdminAuth } from '@/application/auth/use-admin-auth';
import * as auditLogsService from './audit-logs.service';

type UseAuditLogsReturn = {
  data: AuditLogsResult | null;
  loading: boolean;
  error: AppError | null;
  refetch: () => void;
};

export function useAuditLogs(academyId: string, query: AuditLogsQuery): UseAuditLogsReturn {
  const { accessToken } = useAdminAuth();
  const [data, setData] = useState<AuditLogsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => setFetchCount((c) => c + 1), []);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await auditLogsService.listAuditLogs(
        academyId,
        query,
        token,
      );

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
  }, [academyId, queryKey, accessToken, fetchCount]);

  return { data, loading, error, refetch };
}
