/** Supabase read/write helpers for audusd_fade_trades. */

import { getSupabaseClient } from '../../connectors/supabase.js';
import type { FadeTrade, FadeTradeResult } from './fadeTypes.js';

const TABLE = 'audusd_fade_trades';

function db() {
  return getSupabaseClient();
}

export async function loadTradeById(id: number): Promise<FadeTrade | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`loadTradeById: ${error.message}`);
  return (data as FadeTrade | null) ?? null;
}

export async function loadOpenTrades(
  tradeDate: string,
  pair = 'AUD_USD',
  brokerId?: string,
): Promise<FadeTrade[]> {
  let query = db()
    .from(TABLE)
    .select('*')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .is('result', null);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { data, error } = await query;
  if (error) throw new Error(`loadOpenTrades: ${error.message}`);
  return (data ?? []) as FadeTrade[];
}

/** Open trades regardless of date (covers positions opened just before a UTC rollover). */
export async function loadAllOpenTrades(pair = 'AUD_USD'): Promise<FadeTrade[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select('*')
    .eq('pair', pair)
    .is('result', null);
  if (error) throw new Error(`loadAllOpenTrades: ${error.message}`);
  return (data ?? []) as FadeTrade[];
}

export async function countTradesToday(
  tradeDate: string,
  pair = 'AUD_USD',
  brokerId?: string,
): Promise<number> {
  let query = db()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('trade_date', tradeDate)
    .eq('pair', pair);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { count, error } = await query;
  if (error) throw new Error(`countTradesToday: ${error.message}`);
  return count ?? 0;
}

/** True if any trade opened in the last 5 minutes (one-trade-per-bar guard). */
export async function recentTradeOpened(
  tradeDate: string,
  pair = 'AUD_USD',
  brokerId?: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let query = db()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .gte('opened_at', since);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { count, error } = await query;
  if (error) throw new Error(`recentTradeOpened: ${error.message}`);
  return (count ?? 0) > 0;
}

export type FadeTradeInsertFields = {
  trade_date: string;
  pair?: string;
  broker_id?: string;
  oanda_trade_id: string | null;
  units: number;
  direction: string;
  entry_price: number;
  tp_price: number;
  sl_price: number;
  ext_pips: number;
  aligned_eur: number;
  opened_at: string;
};

export async function insertTrade(
  fields: FadeTradeInsertFields,
): Promise<FadeTrade> {
  const { data, error } = await db()
    .from(TABLE)
    .insert({ pair: 'AUD_USD', ...fields })
    .select()
    .single();
  if (error) throw new Error(`insertTrade: ${error.message}`);
  return data as FadeTrade;
}

export type FadeTradeUpdateFields = {
  exit_price?: number | null;
  pnl_pips?: number | null;
  pnl_pips_actual?: number | null;
  result?: FadeTradeResult;
  closed_at?: string;
  close_reason?: string;
  oanda_trade_id?: string;
};

export async function updateTrade(
  id: number,
  fields: FadeTradeUpdateFields,
): Promise<void> {
  const { error } = await db().from(TABLE).update(fields).eq('id', id);
  if (error) throw new Error(`updateTrade: ${error.message}`);
}
