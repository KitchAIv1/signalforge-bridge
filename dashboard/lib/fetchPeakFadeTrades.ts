import { getSupabase } from '@/lib/supabase';
import type { PeakFadeTradeRow } from '@/lib/peakFadeTypes';

export async function fetchPeakFadeTrades(): Promise<PeakFadeTradeRow[]> {
  const { data, error } = await getSupabase()
    .from('peak_fade_trades')
    .select(
      'id, trade_date, pair, broker_id, broker_trade_id, units, direction, ' +
        'entry_price, tp_price, ref_day_key, exit_price, pnl_pips, pnl_pips_actual, ' +
        'result, opened_at, closed_at, close_reason, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as PeakFadeTradeRow[];
}
