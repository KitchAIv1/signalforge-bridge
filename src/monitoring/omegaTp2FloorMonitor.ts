/**
 * Omega tp2 leg: 6p broker TP + software 4p first-peak floor ratchet.
 * Mirrors SIGNALFORGE backtest simulateTp2PeakRatchetLeg.ts on live M5 + mid.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { closeTrade, fetchLatestM5Candle, getPricing } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import { OMEGA_T1_PIPS, OMEGA_T2_PIPS } from '../core/omegaRatchetConstants.js';
import { computeDerivedFields, resultFromPnl } from './tradeMonitorHelpers.js';
import { fetchCloseCandles } from './closeCandleCapture.js';
import {
  candleFavorablePips,
  deleteTp2FloorState,
  favorablePipsFromPrice,
  getOmegaTp2FloorEnabled,
  pipSizeForInstrument,
  shouldCloseTp2AtFloor,
  toTp2FloorState,
  tp2FloorRowExists,
  type Tp2FloorState,
} from './omegaTp2FloorSupport.js';
import { pairToInstrument } from './trailingStopSupport.js';

export const NO_TP2_FLOOR_CLOSE = { shouldClose: false, reason: '' };

export function isOmegaTp2FloorLeg(engineId: string, legType: string | null): boolean {
  return getOmegaTp2FloorEnabled() && engineId === 'omega' && legType === 'tp2';
}

export async function ensureTp2FloorState(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const tradeId = row.oanda_trade_id;
    if (tradeId == null || typeof tradeId !== 'string') return;
    if (await tp2FloorRowExists(supabase, tradeId)) return;

    const fillPrice = Number(row.fill_price);
    if (!Number.isFinite(fillPrice)) return;

    const { error: insErr } = await supabase.from('omega_tp2_floor_state').insert({
      oanda_trade_id: tradeId,
      engine_id: row.engine_id ?? 'omega',
      pair: row.pair,
      direction: String(row.direction ?? '').toLowerCase(),
      fill_price: fillPrice,
      floor_pips: OMEGA_T1_PIPS,
      tp_target_pips: OMEGA_T2_PIPS,
      peak_favorable_pips: 0,
    });
    if (insErr) {
      console.warn('[Tp2Floor] ensureTp2FloorState insert failed', insErr.message);
      return;
    }
    console.log('[Tp2Floor] Initialized state for trade', tradeId);
  } catch (err) {
    console.warn('[Tp2Floor] ensureTp2FloorState', String(err));
  }
}

async function resolveLiveMid(instrument: string): Promise<number | null> {
  try {
    const quotes = await getPricing(instrument);
    const quote = quotes[0];
    if (!quote) return null;
    const mid = (parseFloat(quote.bid) + parseFloat(quote.ask)) / 2;
    return Number.isFinite(mid) && mid > 0 ? mid : null;
  } catch {
    return null;
  }
}

async function updatePeakIfNeeded(
  supabase: SupabaseClient,
  tradeId: string,
  state: Tp2FloorState,
  candlePeakPips: number,
): Promise<number> {
  if (candlePeakPips <= state.peak_favorable_pips) {
    return state.peak_favorable_pips;
  }
  await supabase
    .from('omega_tp2_floor_state')
    .update({
      peak_favorable_pips: candlePeakPips,
      updated_at: new Date().toISOString(),
    })
    .eq('oanda_trade_id', tradeId);
  return candlePeakPips;
}

export async function runTp2FloorCheck(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  oandaTradeId: string,
): Promise<{ shouldClose: boolean; reason: string }> {
  const { data: rawState } = await supabase
    .from('omega_tp2_floor_state')
    .select('*')
    .eq('oanda_trade_id', oandaTradeId)
    .maybeSingle();
  const state = rawState ? toTp2FloorState(rawState as Record<string, unknown>) : null;
  if (!state) return NO_TP2_FLOOR_CLOSE;

  const instrument = pairToInstrument(state.pair);
  const fillPrice = Number(row.fill_price);
  const pipSize = pipSizeForInstrument(instrument);
  const candle = await fetchLatestM5Candle(instrument);
  if (!candle) return NO_TP2_FLOOR_CLOSE;

  const candlePeakPips = candleFavorablePips(state.direction, fillPrice, candle, pipSize);
  const peakPips = await updatePeakIfNeeded(supabase, oandaTradeId, state, candlePeakPips);

  const liveMid = await resolveLiveMid(instrument);
  if (liveMid === null) return NO_TP2_FLOOR_CLOSE;

  const liveFavorablePips = favorablePipsFromPrice(
    state.direction,
    fillPrice,
    liveMid,
    pipSize,
  );

  if (shouldCloseTp2AtFloor(peakPips, liveFavorablePips, state.floor_pips)) {
    return { shouldClose: true, reason: 'ratchet_floor' };
  }
  return NO_TP2_FLOOR_CLOSE;
}

async function persistTp2FloorClose(
  supabase: SupabaseClient,
  oandaTradeId: string,
  logRowId: string,
  logRow: Record<string, unknown>,
  reason: string,
  closedAt: string,
  pnlDollars: number | null,
  exitPriceNum: number | null,
): Promise<void> {
  const signalReceivedAt = logRow.signal_received_at as string | null;
  let durationMins: number | null = null;
  if (signalReceivedAt) {
    const elapsed =
      Math.round((Date.now() - new Date(signalReceivedAt).getTime()) / 60000 * 100) / 100;
    durationMins = Number.isFinite(elapsed) ? elapsed : null;
  }

  const derived = computeDerivedFields(logRow, exitPriceNum, pnlDollars);
  const candleUpdate: Record<string, unknown> = {};
  const entryIso = signalReceivedAt ?? (logRow.created_at as string);
  if (entryIso) {
    const { intraTradeCandles, postExitCandles } = await fetchCloseCandles(
      logRow.pair as string,
      entryIso,
      closedAt,
    );
    if (intraTradeCandles.length > 0) candleUpdate.intra_trade_candles = intraTradeCandles;
    if (postExitCandles.length > 0) candleUpdate.post_exit_candles = postExitCandles;
  }

  await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      close_reason: reason,
      closed_at: closedAt,
      exit_price: exitPriceNum,
      pnl_dollars: pnlDollars,
      result: resultFromPnl(pnlDollars),
      duration_minutes: durationMins,
      ...derived,
      ...candleUpdate,
    })
    .eq('id', logRowId);

  await deleteTp2FloorState(supabase, oandaTradeId);
}

export async function closeTp2FloorLeg(
  supabase: SupabaseClient,
  oandaTradeId: string,
  logRowId: string,
  logRow: Record<string, unknown>,
  reason: string,
): Promise<void> {
  try {
    const closeResult = await closeTrade(oandaTradeId);
    const fillTx = closeResult.orderFillTransaction;
    const closedAt = fillTx?.time ?? new Date().toISOString();
    const pnlDollars = fillTx?.pl != null ? parseFloat(String(fillTx.pl)) : null;
    const exitPriceNum = fillTx?.price != null ? parseFloat(String(fillTx.price)) : null;
    await persistTp2FloorClose(
      supabase,
      oandaTradeId,
      logRowId,
      logRow,
      reason,
      closedAt,
      pnlDollars,
      exitPriceNum,
    );
    recordClosedTrade(resultFromPnl(pnlDollars));
    console.log('[Tp2Floor] Closed tp2 leg', oandaTradeId, 'reason=', reason);
  } catch (err) {
    console.error('[Tp2Floor] Close failed for', oandaTradeId, String(err));
  }
}

export async function cleanupOrphanedTp2FloorStates(supabase: SupabaseClient): Promise<void> {
  if (!getOmegaTp2FloorEnabled()) return;
  try {
    const { data: openRows, error: openErr } = await supabase
      .from('bridge_trade_log')
      .select('oanda_trade_id')
      .eq('status', 'open')
      .eq('engine_id', 'omega')
      .eq('leg_type', 'tp2')
      .not('oanda_trade_id', 'is', null);
    if (openErr) return;

    const openIds = new Set((openRows ?? []).map((r) => r.oanda_trade_id as string));
    const { data: floorRows } = await supabase
      .from('omega_tp2_floor_state')
      .select('oanda_trade_id');
    let deleted = 0;
    for (const row of floorRows ?? []) {
      const oid = row.oanda_trade_id as string;
      if (!openIds.has(oid)) {
        await deleteTp2FloorState(supabase, oid);
        deleted += 1;
      }
    }
    if (deleted > 0) {
      console.log('[Tp2Floor] Cleaned up', deleted, 'orphaned floor state row(s)');
    }
  } catch (err) {
    console.warn('[Tp2Floor] cleanupOrphanedTp2FloorStates', String(err));
  }
}
