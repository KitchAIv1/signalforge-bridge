'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRADE_LOG_PAGE_SIZE,
  buildActivityTradeLogQuery,
  type ActivityTradeLogFilters,
  type BridgeTradeLogRow,
} from '@/lib/activityTradeLogQuery';

export interface UseActivityTradeLogResult {
  rows: BridgeTradeLogRow[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useActivityTradeLog(filters: ActivityTradeLogFilters): UseActivityTradeLogResult {
  const [rows, setRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const supabase = getSupabase();
      const { data, error } = await buildActivityTradeLogQuery(supabase, pageNum, filters);
      if (error) {
        setLoading(false);
        return;
      }
      const list = (data ?? []) as unknown as BridgeTradeLogRow[];
      setRows((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length === ACTIVITY_TRADE_LOG_PAGE_SIZE);
      setLoading(false);
    },
    [filters.decision, filters.engineId, filters.brokerId],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setPage(0);
    void fetchPage(0, false);
  }, [fetchPage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    setLoading(true);
    void fetchPage(next, true);
  }, [page, fetchPage]);

  return { rows, loading, hasMore, loadMore, refresh };
}
