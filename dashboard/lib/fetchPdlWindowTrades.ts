import { getSupabase } from '@/lib/supabase';
import { PDL_SWEEP_PAIR } from '@/lib/pdlSweepConstants';
import type { PdlWindowTradeRow } from '@/lib/pdlWindowTypes';

export async function fetchPdlWindowTrades(): Promise<PdlWindowTradeRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pdl_window_trades')
    .select(
      'id,trade_date,pair,broker_id,oanda_trade_id,units,direction,entry_price,sl_price,exit_price,pnl_pips,pnl_dollars,pnl_r,result,close_reason,opened_at,closed_at,created_at',
    )
    .eq('pair', PDL_SWEEP_PAIR)
    .order('trade_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PdlWindowTradeRow[];
}
