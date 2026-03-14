import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppError } from '../../domain/common/errors';
import type { StudentListItem, StudentListFilters } from '../../domain/student/student.types';
import { listStudentsUseCase, type StudentApiPort } from './use-cases/list-students.usecase';

type UseStudentsResult = {
  items: StudentListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: AppError | null;
  hasMore: boolean;
  refetch: () => void;
  fetchMore: () => void;
};

const PAGE_SIZE = 20;

export function useStudents(
  filters: StudentListFilters,
  studentApi: StudentApiPort,
): UseStudentsResult {
  const [items, setItems] = useState<StudentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const mountedRef = useRef(true);
  // Monotonic counter to discard stale responses from superseded filter changes
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      const requestId = ++requestIdRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      let result;
      try {
        result = await listStudentsUseCase({ studentApi }, filters, targetPage, PAGE_SIZE);
      } catch (e) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setError({ code: 'UNKNOWN', message: String(e) });
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      // Discard stale response if filters changed while request was in flight
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

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
    [filters, studentApi],
  );

  const refetch = useCallback(() => {
    load(1, false);
  }, [load]);

  const fetchMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      load(page + 1, true);
    }
  }, [loadingMore, hasMore, page, load]);

  useEffect(() => {
    mountedRef.current = true;
    load(1, false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { items, loading, loadingMore, error, hasMore, refetch, fetchMore };
}
