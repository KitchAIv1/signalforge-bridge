'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { PNL_CALENDAR_QUERY_START_ISO } from '@/lib/pnlCalendarConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

const REFRESH_MS = 5 * 60 * 1000;

const TRADE_LOG_SELECT =
  'id, created_at, engine_id, direction, result, pnl_r, pnl_dollars, close_reason, bar1_strength, oanda_trade_id, pair, leg_type, signal_id';

export function usePnlCalendarTrades() {
  const [trades, setTrades] = useState<PnlTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabase();
    const { data: rows, error: queryError } = await supabase
      .from('bridge_trade_log')
      .select(TRADE_LOG_SELECT)
      .in('engine_id', [
        'omega',
        'engine_rebuild',
        'scalper',
        'engine_amd',
        'omega_inverse',
      ])
      .eq('status', 'closed')
      .gte('created_at', PNL_CALENDAR_QUERY_START_ISO)
      .order('created_at', { ascending: true });
    if (queryError) {
      setFetchError(queryError.message);
    } else {
      setFetchError(null);
      setTrades((rows ?? []) as PnlTradeRow[]);
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
