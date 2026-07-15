'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { fetchPnlCalendarTrades } from '@/lib/fetchPnlCalendarTrades';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

const REFRESH_MS = 5 * 60 * 1000;

export function usePnlCalendarTrades() {
  const [trades, setTrades] = useState<PnlTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchPnlCalendarTrades(getSupabase());
    if (result.errorMessage) {
      setFetchError(result.errorMessage);
      // Keep any pages already fetched so a mid-pagination failure does not wipe the grid.
      if (result.trades.length > 0) {
        setTrades(result.trades);
      }
    } else {
      setFetchError(
        result.truncated
          ? 'Calendar trade history hit the page cap — newest days may be incomplete.'
          : null,
      );
      setTrades(result.trades);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const intervalId = window.setInterval(() => void reload(), REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [reload]);

  return { trades, loading, fetchError, reload };
}
