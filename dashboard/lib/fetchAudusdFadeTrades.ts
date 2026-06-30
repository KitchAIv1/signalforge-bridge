import {
  AUDUSD_FADE_PAIR,
  AUDUSD_FADE_TRADE_LIMIT,
} from '@/lib/audusdFadeConstants';
import { getSupabase } from '@/lib/supabase';
import type { AudusdFadeTradeRow } from '@/lib/audusdFadeTypes';

const TRADE_SELECT =
  'id, trade_date, pair, oanda_trade_id, units, direction, entry_price, tp_price, sl_price, ' +
  'exit_price, pnl_pips, pnl_pips_actual, result, ext_pips, aligned_eur, opened_at, closed_at, ' +
  'close_reason, created_at';

export async function fetchAudusdFadeTrades(): Promise<AudusdFadeTradeRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audusd_fade_trades')
    .select(TRADE_SELECT)
    .eq('pair', AUDUSD_FADE_PAIR)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(AUDUSD_FADE_TRADE_LIMIT);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AudusdFadeTradeRow[];
}
