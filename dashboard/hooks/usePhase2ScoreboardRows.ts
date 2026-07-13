/**
 * Scoreboard data for ALPHAOMEGA — always Lane B EXECUTED fills, independent of
 * the table All/Taken/Shadow filter (avoids pagination crowding by BLOCKED rows).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRADE_LOG_PAGE_SIZE,
  buildActivityTradeLogQuery,
  type BridgeTradeLogRow,
} from '@/lib/activityTradeLogQuery';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import { isPhase2ShadowFlagged } from '@/lib/phase2LaneAdvisoryFormat';

const MAX_SCOREBOARD_PAGES = 20;

async function fetchLaneBPage(
  pageNum: number,
  decision: string,
): Promise<BridgeTradeLogRow[]> {
  const supabase = getSupabase();
  const { data, error } = await buildActivityTradeLogQuery(supabase, pageNum, {
    decision,
    engineId: 'omega',
    brokerId: OMEGA_LANE_B_BROKER_ID,
  });
  if (error) return [];
  return (data ?? []) as unknown as BridgeTradeLogRow[];
}

async function loadPagedRows(
  decision: string,
  mapPage?: (page: BridgeTradeLogRow[]) => BridgeTradeLogRow[],
): Promise<BridgeTradeLogRow[]> {
  const collected: BridgeTradeLogRow[] = [];
  for (let pageNum = 0; pageNum < MAX_SCOREBOARD_PAGES; pageNum += 1) {
    const page = await fetchLaneBPage(pageNum, decision);
    collected.push(...(mapPage ? mapPage(page) : page));
    if (page.length < ACTIVITY_TRADE_LOG_PAGE_SIZE) break;
  }
  return collected;
}

export function usePhase2ScoreboardRows() {
  const [tradeRows, setTradeRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [executedRows, shadowRows] = await Promise.all([
      loadPagedRows('EXECUTED'),
      loadPagedRows('', (page) => page.filter(isPhase2ShadowFlagged)),
    ]);
    const byId = new Map<string, BridgeTradeLogRow>();
    for (const row of [...executedRows, ...shadowRows]) {
      byId.set(row.id, row);
    }
    setTradeRows([...byId.values()]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tradeRows, loading, refresh };
}
