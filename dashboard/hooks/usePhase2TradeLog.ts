'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRADE_LOG_PAGE_SIZE,
  buildActivityTradeLogQuery,
  type BridgeTradeLogRow,
} from '@/lib/activityTradeLogQuery';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import { isPhase2ShadowFlagged } from '@/lib/phase2LaneAdvisoryFormat';
import type { Phase2ViewFilter } from '@/components/omegaPhase2/Phase2ViewFilterBar';

function decisionForServerFilter(viewFilter: Phase2ViewFilter): string {
  if (viewFilter === 'executed' || viewFilter === 'shadow') return 'EXECUTED';
  if (viewFilter === 'blocked') return 'BLOCKED';
  return '';
}

function applyClientViewFilter(
  tradeRows: BridgeTradeLogRow[],
  viewFilter: Phase2ViewFilter,
): BridgeTradeLogRow[] {
  if (viewFilter === 'shadow') {
    return tradeRows.filter((row) => isPhase2ShadowFlagged(row));
  }
  return tradeRows;
}

export function usePhase2TradeLog(viewFilter: Phase2ViewFilter) {
  const [rawRows, setRawRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const supabase = getSupabase();
      const { data, error } = await buildActivityTradeLogQuery(supabase, pageNum, {
        decision: decisionForServerFilter(viewFilter),
        engineId: 'omega',
        brokerId: OMEGA_LANE_B_BROKER_ID,
      });
      if (error) {
        setLoading(false);
        return;
      }
      const list = (data ?? []) as unknown as BridgeTradeLogRow[];
      setRawRows((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length === ACTIVITY_TRADE_LOG_PAGE_SIZE);
      setLoading(false);
    },
    [viewFilter],
  );

  useEffect(() => {
    setLoading(true);
    setPage(0);
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoading(true);
    void fetchPage(nextPage, true);
  }, [page, fetchPage]);

  const visibleRows = useMemo(
    () => applyClientViewFilter(rawRows, viewFilter),
    [rawRows, viewFilter],
  );

  return { rows: visibleRows, rawRows, loading, hasMore, loadMore };
}
