/** Supabase helpers for peak_fade_trades. */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { PEAK_FADE_TRADES_TABLE } from './peakFadeConstants.js';
import type { PeakFadeResult, PeakFadeTrade } from './peakFadeTypes.js';

function db() {
  return getSupabaseClient();
}

export async function loadAllOpenTrades(pair: string): Promise<PeakFadeTrade[]> {
  const { data, error } = await db()
    .from(PEAK_FADE_TRADES_TABLE)
    .select('*')
    .eq('pair', pair)
    .is('result', null);
  if (error) throw new Error(`peakFade loadAllOpenTrades: ${error.message}`);
  return (data ?? []) as PeakFadeTrade[];
}

export async function loadOpenTradesForBroker(
  pair: string,
  brokerId: string,
): Promise<PeakFadeTrade[]> {
  const { data, error } = await db()
    .from(PEAK_FADE_TRADES_TABLE)
    .select('*')
    .eq('pair', pair)
    .eq('broker_id', brokerId)
    .is('result', null);
  if (error) throw new Error(`peakFade loadOpenTradesForBroker: ${error.message}`);
  return (data ?? []) as PeakFadeTrade[];
}

export async function recentTradeOpenedForBroker(
  pair: string,
  brokerId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from(PEAK_FADE_TRADES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('pair', pair)
    .eq('broker_id', brokerId)
    .gte('opened_at', since);
  if (error) throw new Error(`peakFade recentTradeOpenedForBroker: ${error.message}`);
  return (count ?? 0) > 0;
}

export type PeakFadeInsertFields = {
  trade_date: string;
  pair: string;
  broker_id: string;
  broker_trade_id: string | null;
  units: number;
  direction: string;
  entry_price: number;
  tp_price: number;
  ref_day_key: string;
  ref_extreme: number;
  near_pips: number;
  trend_progress_pips: number;
  opened_at: string;
};

export async function insertTrade(fields: PeakFadeInsertFields): Promise<void> {
  const { error } = await db().from(PEAK_FADE_TRADES_TABLE).insert(fields);
  if (error) throw new Error(`peakFade insertTrade: ${error.message}`);
}

export async function updateTrade(
  id: number,
  fields: {
    result: PeakFadeResult;
    exit_price: number;
    pnl_pips: number;
    pnl_pips_actual: number;
    closed_at: string;
    close_reason: string;
  },
): Promise<void> {
  const { error } = await db()
    .from(PEAK_FADE_TRADES_TABLE)
    .update(fields)
    .eq('id', id);
  if (error) throw new Error(`peakFade updateTrade: ${error.message}`);
}
