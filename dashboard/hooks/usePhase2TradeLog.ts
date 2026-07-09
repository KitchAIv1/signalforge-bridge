'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRADE_LOG_PAGE_SIZE,
  buildActivityTradeLogQuery,
  type BridgeTradeLogRow,
} from '@/lib/activityTradeLogQuery';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import {
  isAlphaOmegaLiveBlock,
  isPhase2ShadowFlagged,
} from '@/lib/phase2LaneAdvisoryFormat';
import type { Phase2ViewFilter } from '@/components/omegaPhase2/Phase2ViewFilterBar';

function decisionForServerFilter(viewFilter: Phase2ViewFilter): string {
  if (viewFilter === 'executed') return 'EXECUTED';
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
  if (viewFilter === 'blocked') {
    return tradeRows.filter((row) => isAlphaOmegaLiveBlock(row));
  }
  return tradeRows;
}

async function fetchPhase2Page(
  pageNum: number,
  viewFilter: Phase2ViewFilter,
): Promise<BridgeTradeLogRow[] | null> {
  const supabase = getSupabase();
  const { data, error } = await buildActivityTradeLogQuery(supabase, pageNum, {
    decision: decisionForServerFilter(viewFilter),
    engineId: 'omega',
    brokerId: OMEGA_LANE_B_BROKER_ID,
  });
  if (error) return null;
  return (data ?? []) as unknown as BridgeTradeLogRow[];
}

export function usePhase2TradeLog(viewFilter: Phase2ViewFilter) {
  const [rawRows, setRawRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const list = await fetchPhase2Page(pageNum, viewFilter);
      if (!list) {
        setLoading(false);
        return;
      }
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
