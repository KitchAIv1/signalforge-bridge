'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchPdlWindowTrades } from '@/lib/fetchPdlWindowTrades';
import { usePollingInterval } from '@/hooks/usePollingInterval';
import type { PdlWindowTradeRow } from '@/lib/pdlWindowTypes';
import { normalizeTradeDateKey } from '@/lib/pdlWindowDirection';
import {
  PDL_POLL_END_HOUR_UTC,
  PDL_POLL_END_MINUTE_UTC,
  PDL_POLL_START_HOUR_UTC,
  PDL_POLL_START_MINUTE_UTC,
  PDL_SWEEP_REFRESH_MS,
} from '@/lib/pdlSweepConstants';

export type UsePdlWindowTradesResult = {
  trades: PdlWindowTradeRow[];
  tradesByDate: Map<string, PdlWindowTradeRow[]>;
  loading: boolean;
  error: string | null;
};

function isActivePollWindow(): boolean {
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMins = PDL_POLL_START_HOUR_UTC * 60 + PDL_POLL_START_MINUTE_UTC;
  const endMins = PDL_POLL_END_HOUR_UTC * 60 + PDL_POLL_END_MINUTE_UTC;
  return nowMins >= startMins && nowMins <= endMins;
}

function groupByTradeDate(trades: PdlWindowTradeRow[]): Map<string, PdlWindowTradeRow[]> {
  const map = new Map<string, PdlWindowTradeRow[]>();
  for (const trade of trades) {
    const key = normalizeTradeDateKey(trade.trade_date);
    const list = map.get(key) ?? [];
    list.push(trade);
    map.set(key, list);
  }
  return map;
}

export function usePdlWindowTrades(): UsePdlWindowTradesResult {
  const [trades, setTrades] = useState<PdlWindowTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedTrades = await fetchPdlWindowTrades();
      setTrades(fetchedTrades);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load always runs; subsequent ticks only fetch during the PDL poll window.
  usePollingInterval(() => {
    if (isActivePollWindow()) void load();
  }, PDL_SWEEP_REFRESH_MS, { runImmediately: false });

  useEffect(() => {
    void load();
  }, [load]);

  return {
    trades,
    tradesByDate: groupByTradeDate(trades),
    loading,
    error,
  };
}
