'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRADE_LOG_PAGE_SIZE,
  buildActivityTradeLogQuery,
  type BridgeTradeLogRow,
} from '@/lib/activityTradeLogQuery';
import { OMEGA_AO_SHADOW_BROKER_ID } from '@/lib/omegaLaneBConstants';

async function fetchShadowPage(pageNum: number): Promise<BridgeTradeLogRow[] | null> {
  const supabase = getSupabase();
  const { data, error } = await buildActivityTradeLogQuery(supabase, pageNum, {
    decision: 'EXECUTED',
    engineId: 'omega',
    brokerId: OMEGA_AO_SHADOW_BROKER_ID,
    brokerIds: [OMEGA_AO_SHADOW_BROKER_ID],
  });
  if (error) return null;
  return (data ?? []) as unknown as BridgeTradeLogRow[];
}

/** Shadow AO paper EXECUTED rows only (broker_id=ao_shadow_paper). */
export function useShadowAoTradeLog(enabled: boolean) {
  const [rows, setRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    const list = await fetchShadowPage(pageNum);
    if (!list) {
      setLoading(false);
      return;
    }
    setRows((prev) => (append ? [...prev, ...list] : list));
    setHasMore(list.length === ACTIVITY_TRADE_LOG_PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setPage(0);
    void fetchPage(0, false);
  }, [enabled, fetchPage]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoading(true);
    void fetchPage(nextPage, true);
  }, [fetchPage, page]);

  return { rows, loading, hasMore, loadMore };
}
