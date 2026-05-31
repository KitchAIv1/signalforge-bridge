/** Supabase read/write helpers for scalper_day_state and scalper_trades. */

import { getSupabaseClient } from '../../connectors/supabase.js';
import type {
  ScalperDayState,
  ScalperStopReason,
  ScalperTrade,
  ScalperTradeResult,
} from './scalperTypes.js';

function db() {
  return getSupabaseClient();
}

// ─── scalper_day_state ───────────────────────────────────────────────────────

export async function loadTodayDayState(
  tradeDate: string,
  pair = 'AUD_USD',
): Promise<ScalperDayState | null> {
  const { data, error } = await db()
    .from('scalper_day_state')
    .select('*')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .maybeSingle();
  if (error) throw new Error(`loadTodayDayState: ${error.message}`);
  return (data as ScalperDayState | null) ?? null;
}

export type DayStateUpsertFields = {
  trade_date: string;
  pair?: string;
  direction?: string | null;
  reference_price?: number | null;
  trigger_level?: number | null;
  ratchet_count?: number;
  day_stopped?: boolean;
  stop_reason?: ScalperStopReason | null;
  net_pips_day?: number;
};

export async function upsertDayState(fields: DayStateUpsertFields): Promise<void> {
  const { error } = await db()
    .from('scalper_day_state')
    .upsert(
      { pair: 'AUD_USD', ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'trade_date,pair' },
    );
  if (error) throw new Error(`upsertDayState: ${error.message}`);
}

export async function stopDay(
  tradeDate: string,
  stopReason: ScalperStopReason,
  pair = 'AUD_USD',
): Promise<void> {
  await upsertDayState({ trade_date: tradeDate, pair, day_stopped: true, stop_reason: stopReason });
}

// ─── scalper_trades ──────────────────────────────────────────────────────────

export async function loadOpenTrades(
  tradeDate: string,
  pair = 'AUD_USD',
): Promise<ScalperTrade[]> {
  const { data, error } = await db()
    .from('scalper_trades')
    .select('*')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .is('result', null);
  if (error) throw new Error(`loadOpenTrades: ${error.message}`);
  return (data ?? []) as ScalperTrade[];
}

export async function loadFailedForceFlatTrades(
  tradeDate: string,
  pair = 'AUD_USD',
): Promise<ScalperTrade[]> {
  const { data, error } = await db()
    .from('scalper_trades')
    .select('*')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .eq('result', 'force_flat_failed');
  if (error) throw new Error(`loadFailedForceFlatTrades: ${error.message}`);
  return (data ?? []) as ScalperTrade[];
}

export type TradeInsertFields = {
  trade_date: string;
  pair?: string;
  oanda_trade_id: string | null;
  direction: string;
  entry_price: number;
  tp_price: number;
  sl_price: number;
  ratchet_index: number;
  opened_at: string;
};

export async function insertTrade(fields: TradeInsertFields): Promise<ScalperTrade> {
  const { data, error } = await db()
    .from('scalper_trades')
    .insert({ pair: 'AUD_USD', ...fields })
    .select()
    .single();
  if (error) throw new Error(`insertTrade: ${error.message}`);
  return data as ScalperTrade;
}

export type TradeUpdateFields = {
  exit_price?: number | null;
  pnl_pips?: number | null;
  pnl_pips_actual?: number | null;
  result?: ScalperTradeResult;
  closed_at?: string;
  close_reason?: string;
  oanda_trade_id?: string;
};

export async function updateTrade(
  id: number,
  fields: TradeUpdateFields,
  tradeDate: string,
): Promise<void> {
  const { error } = await db()
    .from('scalper_trades')
    .update(fields)
    .eq('id', id);
  if (error) throw new Error(`updateTrade: ${error.message}`);
  if (fields.result) {
    await refreshDayNetPips(tradeDate);
  }
}

// ─── net_pips_day ────────────────────────────────────────────────────────────

export async function refreshDayNetPips(
  tradeDate: string,
  pair = 'AUD_USD',
): Promise<void> {
  const { data, error } = await db()
    .from('scalper_trades')
    .select('pnl_pips')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .not('result', 'is', null);
  if (error) throw new Error(`refreshDayNetPips query: ${error.message}`);

  const total = ((data ?? []) as Array<{ pnl_pips: number | null }>).reduce(
    (sum, row) => sum + (row.pnl_pips ?? 0),
    0,
  );
  const rounded = Math.round(total * 10) / 10;

  const { error: upErr } = await db()
    .from('scalper_day_state')
    .update({ net_pips_day: rounded, updated_at: new Date().toISOString() })
    .eq('trade_date', tradeDate)
    .eq('pair', pair);
  if (upErr) throw new Error(`refreshDayNetPips update: ${upErr.message}`);
}

// ─── recent-entry guard (Issue C fix) ───────────────────────────────────────

/** Returns true if any trade was opened in the last 5 minutes (one-trade-per-bar guard). */
export async function recentTradeOpened(
  tradeDate: string,
  pair = 'AUD_USD',
): Promise<boolean> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from('scalper_trades')
    .select('id', { count: 'exact', head: true })
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .gte('opened_at', since);
  if (error) throw new Error(`recentTradeOpened: ${error.message}`);
  return (count ?? 0) > 0;
}
