'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { fetchPnlCalendarTrades } from '@/lib/fetchPnlCalendarTrades';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

/** Focus-gated reload: skip if the last full re-page was more recent than this. */
const MIN_FOCUS_RELOAD_MS = 5 * 60 * 1000;

export function usePnlCalendarTrades() {
  const [trades, setTrades] = useState<PnlTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastLoadMsRef = useRef(0);

  const reload = useCallback(async () => {
    lastLoadMsRef.current = Date.now();
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

  // No background polling: the full re-page is heavy, so it only runs on mount
  // and when the tab regains visibility after being stale (plus manual reload).
  useEffect(() => {
    void reload();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadMsRef.current < MIN_FOCUS_RELOAD_MS) return;
      void reload();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reload]);

  return { trades, loading, fetchError, reload };
}
