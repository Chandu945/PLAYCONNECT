import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppError } from '../../domain/common/errors';
import type { AuditLogItem, AuditActionType, AuditEntityType } from '../../domain/audit/audit.types';
import { listAuditLogsUseCase, type AuditApiPort } from './use-cases/list-audit-logs.usecase';

const PAGE_SIZE = 50;

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AuditFilters = {
  from: string;
  to: string;
  action: AuditActionType | '';
  entityType: AuditEntityType | '';
};

type UseAuditLogsResult = {
  items: AuditLogItem[];
  loading: boolean;
  loadingMore: boolean;
  error: AppError | null;
  hasMore: boolean;
  filters: AuditFilters;
  setFilters: (f: AuditFilters) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  fetchMore: () => void;
  refetch: () => void;
};

export function useAuditLogs(auditApi: AuditApiPort): UseAuditLogsResult {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({
    from: defaultFrom(),
    to: defaultTo(),
    action: '',
    entityType: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(filters);
  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (targetPage: number, append: boolean, activeFilters: AuditFilters) => {
      const currentLoadId = ++loadIdRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await listAuditLogsUseCase(
        { auditApi },
        {
          page: targetPage,
          pageSize: PAGE_SIZE,
          from: activeFilters.from || undefined,
          to: activeFilters.to || undefined,
          action: activeFilters.action || undefined,
          entityType: activeFilters.entityType || undefined,
        },
      );

      // Discard stale responses from superseded requests
      if (!mountedRef.current || currentLoadId !== loadIdRef.current) return;

      if (result.ok) {
        if (append) {
          setItems((prev) => [...prev, ...result.value.items]);
        } else {
          setItems(result.value.items);
        }
        setPage(targetPage);
        setHasMore(targetPage < result.value.meta.totalPages);
      } else {
        setError(result.error);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [auditApi],
  );

  const refetch = useCallback(() => {
    load(1, false, appliedFilters);
  }, [load, appliedFilters]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(filters);
    load(1, false, filters);
  }, [filters, load]);

  const clearFilters = useCallback(() => {
    const defaults: AuditFilters = { from: defaultFrom(), to: defaultTo(), action: '', entityType: '' };
    setFilters(defaults);
    setAppliedFilters(defaults);
    load(1, false, defaults);
  }, [load]);

  const fetchMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) {
      load(page + 1, true, appliedFilters);
    }
  }, [loadingMore, loading, hasMore, page, load, appliedFilters]);

  useEffect(() => {
    mountedRef.current = true;
    load(1, false, appliedFilters);
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    filters,
    setFilters,
    applyFilters,
    clearFilters,
    fetchMore,
    refetch,
  };
}
