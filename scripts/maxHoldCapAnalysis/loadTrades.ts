import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LiveTradeRow } from './types.js';

const SELECT_FIELDS =
  'id, signal_id, oanda_trade_id, direction, fill_price, stop_loss, exit_price, ' +
  'pnl_pips, pnl_dollars, pnl_r, close_reason, duration_minutes, signal_received_at, ' +
  'closed_at, pair';

export async function loadOandaOmegaTrades(
  supabase: SupabaseClient,
  sinceIso: string,
  minDurationMin?: number,
): Promise<LiveTradeRow[]> {
  let query = supabase
    .from('bridge_trade_log')
    .select(SELECT_FIELDS)
    .eq('engine_id', 'omega')
    .eq('status', 'closed')
    .eq('decision', 'EXECUTED')
    .eq('broker_id', 'oanda_practice')
    .gte('created_at', sinceIso)
    .not('fill_price', 'is', null)
    .not('stop_loss', 'is', null)
    .not('signal_received_at', 'is', null)
    .order('signal_received_at', { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as LiveTradeRow[];
  if (minDurationMin == null) return rows;
  return rows.filter((row) => (row.duration_minutes ?? 0) > minDurationMin);
}

export async function loadMaxHoldTrades(supabase: SupabaseClient, sinceIso: string): Promise<LiveTradeRow[]> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(SELECT_FIELDS)
    .eq('engine_id', 'omega')
    .eq('status', 'closed')
    .eq('decision', 'EXECUTED')
    .eq('broker_id', 'oanda_practice')
    .eq('close_reason', 'max_hold')
    .gte('created_at', sinceIso)
    .not('fill_price', 'is', null)
    .not('stop_loss', 'is', null)
    .order('closed_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LiveTradeRow[];
}
