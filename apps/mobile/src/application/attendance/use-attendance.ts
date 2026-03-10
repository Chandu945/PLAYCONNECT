import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppError } from '../../domain/common/errors';
import type {
  DailyAttendanceItem,
  AttendanceStatus,
} from '../../domain/attendance/attendance.types';
import {
  getDailyAttendanceUseCase,
  type DailyAttendanceApiPort,
} from './use-cases/get-daily-attendance.usecase';
import {
  markAttendanceUseCase,
  type MarkAttendanceApiPort,
} from './use-cases/mark-attendance.usecase';
import { getTodayIST } from '../../domain/common/date-utils';

export type AttendanceApiPort = DailyAttendanceApiPort & MarkAttendanceApiPort;

type UseAttendanceResult = {
  items: DailyAttendanceItem[];
  loading: boolean;
  loadingMore: boolean;
  error: AppError | null;
  hasMore: boolean;
  isHoliday: boolean;
  date: string;
  refetch: () => void;
  fetchMore: () => void;
  toggleStatus: (studentId: string) => void;
};

const PAGE_SIZE = 50;

export { getTodayIST };

export function useAttendance(
  date: string,
  attendanceApi: AttendanceApiPort,
  batchId?: string | null,
  search?: string | null,
): UseAttendanceResult {
  const [items, setItems] = useState<DailyAttendanceItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [isHoliday, setIsHoliday] = useState(false);
  const mountedRef = useRef(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await getDailyAttendanceUseCase(
        { attendanceApi },
        date,
        targetPage,
        PAGE_SIZE,
        batchId ?? undefined,
        search ?? undefined,
      );

      if (!mountedRef.current) return;

      if (result.ok) {
        if (append) {
          setItems((prev) => [...prev, ...result.value.items]);
        } else {
          setItems(result.value.items);
          setIsHoliday(result.value.isHoliday);
        }
        setPage(targetPage);
        setHasMore(targetPage < result.value.meta.totalPages);
      } else {
        setError(result.error);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [date, attendanceApi, batchId, search],
  );

  const refetch = useCallback(() => {
    load(1, false);
  }, [load]);

  const fetchMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      load(page + 1, true);
    }
  }, [loadingMore, hasMore, page, load]);

  const toggleStatus = useCallback(
    (studentId: string) => {
      if (isHoliday) return;

      setItems((prev) =>
        prev.map((item) => {
          if (item.studentId !== studentId) return item;
          const newStatus: AttendanceStatus = item.status === 'ABSENT' ? 'PRESENT' : 'ABSENT';
          return { ...item, status: newStatus };
        }),
      );

      const currentItem = itemsRef.current.find((i) => i.studentId === studentId);
      if (!currentItem) return;

      const newStatus: AttendanceStatus = currentItem.status === 'ABSENT' ? 'PRESENT' : 'ABSENT';

      markAttendanceUseCase({ attendanceApi }, studentId, date, newStatus).then((result) => {
        if (!mountedRef.current) return;
        if (!result.ok) {
          setItems((prev) =>
            prev.map((item) =>
              item.studentId === studentId ? { ...item, status: currentItem.status } : item,
            ),
          );
          setError(result.error);
        }
      });
    },
    [isHoliday, attendanceApi, date],
  );

  useEffect(() => {
    mountedRef.current = true;
    load(1, false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    isHoliday,
    date,
    refetch,
    fetchMore,
    toggleStatus,
  };
}
