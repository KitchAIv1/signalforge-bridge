/**
 * Paginated closed-trade fetch for the P&L calendar.
 * Supabase caps a single select at ~1000 rows; without paging, recent days vanish.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PNL_CALENDAR_ENGINE_IDS,
  PNL_CALENDAR_MAX_PAGES,
  PNL_CALENDAR_PAGE_SIZE,
  PNL_CALENDAR_QUERY_START_ISO,
} from '@/lib/pnlCalendarConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

export const PNL_CALENDAR_TRADE_SELECT =
  'id, created_at, engine_id, broker_id, direction, result, pnl_r, pnl_dollars, close_reason, bar1_strength, oanda_trade_id, pair, leg_type, signal_id';

export interface FetchPnlCalendarTradesResult {
  trades: PnlTradeRow[];
  errorMessage: string | null;
  pageCount: number;
  truncated: boolean;
}

export async function fetchPnlCalendarTrades(
  supabase: SupabaseClient,
): Promise<FetchPnlCalendarTradesResult> {
  const trades: PnlTradeRow[] = [];
  let pageCount = 0;
  let truncated = false;

  for (let page = 0; page < PNL_CALENDAR_MAX_PAGES; page += 1) {
    const from = page * PNL_CALENDAR_PAGE_SIZE;
    const to = from + PNL_CALENDAR_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select(PNL_CALENDAR_TRADE_SELECT)
      .in('engine_id', [...PNL_CALENDAR_ENGINE_IDS])
      .eq('status', 'closed')
      .gte('created_at', PNL_CALENDAR_QUERY_START_ISO)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      return { trades, errorMessage: error.message, pageCount, truncated };
    }

    pageCount += 1;
    const batch = (data ?? []) as PnlTradeRow[];
    trades.push(...batch);

    if (batch.length < PNL_CALENDAR_PAGE_SIZE) {
      return { trades, errorMessage: null, pageCount, truncated: false };
    }
  }

  truncated = true;
  return {
    trades,
    errorMessage: null,
    pageCount,
    truncated,
  };
}
