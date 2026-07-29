'use client';

import { useEffect, useState } from 'react';
import { fetchPdlWindowTrades } from '@/lib/fetchPdlWindowTrades';
import type { PdlWindowTradeRow } from '@/lib/pdlWindowTypes';
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
    const list = map.get(trade.trade_date) ?? [];
    list.push(trade);
    map.set(trade.trade_date, list);
  }
  return map;
}

export function usePdlWindowTrades(): UsePdlWindowTradesResult {
  const [trades, setTrades] = useState<PdlWindowTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPdlWindowTrades();
        if (!cancelled) setTrades(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    if (!isActivePollWindow()) {
      return () => {
        cancelled = true;
      };
    }

    const ticker = setInterval(() => {
      void load();
    }, PDL_SWEEP_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, []);

  return {
    trades,
    tradesByDate: groupByTradeDate(trades),
    loading,
    error,
  };
}
