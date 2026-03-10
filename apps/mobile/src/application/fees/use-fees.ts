import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppError } from '../../domain/common/errors';
import type { FeeDueItem } from '../../domain/fees/fees.types';
import {
  listUnpaidDuesUseCase,
  type ListUnpaidDuesApiPort,
} from './use-cases/list-unpaid-dues.usecase';
import { listPaidDuesUseCase, type ListPaidDuesApiPort } from './use-cases/list-paid-dues.usecase';
import { getCurrentMonthIST } from '../../domain/common/date-utils';

export type FeesApiPort = ListUnpaidDuesApiPort & ListPaidDuesApiPort;

type UseFeesResult = {
  unpaidItems: FeeDueItem[];
  paidItems: FeeDueItem[];
  loading: boolean;
  error: AppError | null;
  month: string;
  setMonth: (m: string) => void;
  refetch: () => void;
};

export { getCurrentMonthIST };

export function useFees(feesApi: FeesApiPort): UseFeesResult {
  const [month, setMonth] = useState(getCurrentMonthIST);
  const [unpaidItems, setUnpaidItems] = useState<FeeDueItem[]>([]);
  const [paidItems, setPaidItems] = useState<FeeDueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [unpaidSettled, paidSettled] = await Promise.allSettled([
      listUnpaidDuesUseCase({ feesApi }, month),
      listPaidDuesUseCase({ feesApi }, month),
    ]);

    if (!mountedRef.current) return;

    // Handle rejected promises (network failures, unexpected throws)
    if (unpaidSettled.status === 'rejected') {
      setError({ code: 'NETWORK', message: 'Failed to load unpaid dues.' });
      setLoading(false);
      return;
    }
    if (paidSettled.status === 'rejected') {
      setError({ code: 'NETWORK', message: 'Failed to load paid dues.' });
      setLoading(false);
      return;
    }

    const unpaidResult = unpaidSettled.value;
    const paidResult = paidSettled.value;

    if (!unpaidResult.ok) {
      setError(unpaidResult.error);
      setLoading(false);
      return;
    }
    if (!paidResult.ok) {
      setError(paidResult.error);
      setLoading(false);
      return;
    }

    setUnpaidItems(unpaidResult.value);
    setPaidItems(paidResult.value);
    setLoading(false);
  }, [month, feesApi]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { unpaidItems, paidItems, loading, error, month, setMonth, refetch };
}
