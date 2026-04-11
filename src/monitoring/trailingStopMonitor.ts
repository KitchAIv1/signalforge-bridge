/**
 * Trailing stop for configured bridge engines (e.g. charlie, charlie_shadow).
 * State in trail_stop_state; driven by trade monitor cadence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { closeTrade, fetchLatestM5Candle } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import { computeDerivedFields, resultFromPnl } from './tradeMonitorHelpers.js';
import {
  NO_TRAIL_CLOSE,
  applyTrailPeakUpdates,
  computeTrailInsertFields,
  evaluateTrailExitDecision,
  favorableAndAdverse,
  getSlMultiplier,
  getTrailEnabled,
  getTrailEngineIds,
  loadTrailStateForCheck,
  pairToInstrument,
  trailStopRowExists,
} from './trailingStopSupport.js';

const candleFetchFailures = new Map<string, number>();
const CANDLE_FAILURE_ALERT_THRESHOLD = 5;

export function isTrailStopEngine(engineId: string): boolean {
  if (!getTrailEnabled()) return false;
  return getTrailEngineIds().includes(engineId);
}

export async function ensureTrailStopState(
  supabase: SupabaseClient,
  row: Record<string, unknown>
): Promise<void> {
  try {
    const tradeId = row.oanda_trade_id;
    if (tradeId == null || typeof tradeId !== 'string') return;
    if (await trailStopRowExists(supabase, tradeId)) return;

    const metrics = computeTrailInsertFields(row);
    if (!metrics) return;

    const { error: insErr } = await supabase.from('trail_stop_state').insert({
      oanda_trade_id: tradeId,
      engine_id: row.engine_id,
      pair: row.pair,
      direction: row.direction,
      entry_price: Number(row.entry_price),
      sl_distance: metrics.slDistance,
      trail_distance: metrics.trailDistance,
      r_size_raw: metrics.rSizeRaw,
      peak_favorable: 0,
      trail_activated: false,
      activation_threshold: metrics.activationThreshold,
    });
    if (insErr) {
      console.warn('[TrailStop] ensureTrailStopState insert failed', insErr.message);
      return;
    }
    console.log(
      `[TrailStop] Initialized state for trade ${tradeId} pair=${String(row.pair)} direction=${String(
        row.direction
      )} rSize=${metrics.rSizeRaw}`
    );
  } catch (err) {
    console.warn('[TrailStop] ensureTrailStopState', String(err));
  }
}

export async function runTrailingStopCheck(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  oandaTradeId: string
): Promise<{ shouldClose: boolean; reason: string; pnlR: number | null }> {
  const state = await loadTrailStateForCheck(supabase, oandaTradeId);
  if (!state) return NO_TRAIL_CLOSE;

  const instrument = pairToInstrument(state.pair);
  const fillPrice = Number(row.fill_price);
  const candle = await fetchLatestM5Candle(instrument);
  if (!candle) {
    const failures = (candleFetchFailures.get(oandaTradeId) ?? 0) + 1;
    candleFetchFailures.set(oandaTradeId, failures);
    if (failures >= CANDLE_FAILURE_ALERT_THRESHOLD) {
      console.error(
        '[TrailStop] ALERT: Candle fetch failed',
        failures,
        'consecutive times for trade',
        oandaTradeId,
        'pair=',
        instrument,
        '— trail stop NOT executing'
      );
    } else {
      console.warn(
        '[TrailStop] Candle fetch failed for',
        instrument,
        `(attempt ${failures}/${CANDLE_FAILURE_ALERT_THRESHOLD})`
      );
    }
    return NO_TRAIL_CLOSE;
  }
  candleFetchFailures.delete(oandaTradeId);

  const { favorable, adverse } = favorableAndAdverse(state.direction, fillPrice, candle);
  if (adverse >= state.sl_distance && !state.trail_activated) {
    return { shouldClose: true, reason: 'trail_sl_hit', pnlR: -getSlMultiplier() };
  }

  const nowActivated = state.trail_activated || favorable >= state.activation_threshold;
  const peakFavorable = await applyTrailPeakUpdates(
    supabase,
    oandaTradeId,
    state,
    nowActivated,
    favorable
  );

  const exitDecision = evaluateTrailExitDecision(
    state,
    nowActivated,
    peakFavorable,
    favorable,
    adverse
  );
  return exitDecision ?? NO_TRAIL_CLOSE;
}

async function persistBridgeLogAfterTrailClose(
  supabase: SupabaseClient,
  oandaTradeId: string,
  logRowId: string,
  logRow: Record<string, unknown>,
  reason: string,
  closedAt: string,
  pnlDollars: number | null,
  exitPriceNum: number | null
): Promise<void> {
  const signalReceivedAt = logRow.signal_received_at as string | null;
  let durationMins: number | null = null;
  if (signalReceivedAt) {
    const elapsed =
      Math.round((Date.now() - new Date(signalReceivedAt).getTime()) / 60000 * 100) / 100;
    durationMins = Number.isFinite(elapsed) ? elapsed : null;
  }

  const derived = computeDerivedFields(logRow, exitPriceNum, pnlDollars);
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
    })
    .eq('id', logRowId);
  await supabase.from('trail_stop_state').delete().eq('oanda_trade_id', oandaTradeId);
}

export async function closeTrailStop(
  supabase: SupabaseClient,
  oandaTradeId: string,
  logRowId: string,
  logRow: Record<string, unknown>,
  reason: string
): Promise<void> {
  try {
    const closeResult = await closeTrade(oandaTradeId);
    const fillTx = closeResult.orderFillTransaction;
    const closedAt = fillTx?.time ?? new Date().toISOString();
    const pnlDollars = fillTx?.pl != null ? parseFloat(String(fillTx.pl)) : null;
    const exitPriceNum = fillTx?.price != null ? parseFloat(String(fillTx.price)) : null;
    await persistBridgeLogAfterTrailClose(
      supabase,
      oandaTradeId,
      logRowId,
      logRow,
      reason,
      closedAt,
      pnlDollars,
      exitPriceNum
    );
    recordClosedTrade(resultFromPnl(pnlDollars));
    console.log(
      '[TrailStop] Closed trade',
      oandaTradeId,
      'engine=',
      logRow.engine_id,
      'pair=',
      logRow.pair,
      'reason=',
      reason
    );
  } catch (err) {
    console.error('[TrailStop] Close failed for', oandaTradeId, String(err));
  }
}

function collectOrphanTrailIds(
  openIds: string[],
  trailRows: Array<{ oanda_trade_id: string }>
): string[] {
  const openSet = new Set(openIds);
  return trailRows.map((r) => r.oanda_trade_id).filter((oid) => !openSet.has(oid));
}

export async function cleanupOrphanedTrailStates(supabase: SupabaseClient): Promise<void> {
  try {
    const { data: openRows, error: openErr } = await supabase
      .from('bridge_trade_log')
      .select('oanda_trade_id')
      .eq('status', 'open')
      .not('oanda_trade_id', 'is', null);
    if (openErr) {
      console.warn('[TrailStop] cleanup open rows failed', openErr.message);
      return;
    }
    const openIds = (openRows ?? []).map((r) => r.oanda_trade_id as string).filter(Boolean);
    const { data: trailRows, error: trailErr } = await supabase
      .from('trail_stop_state')
      .select('oanda_trade_id');
    if (trailErr) {
      console.warn('[TrailStop] cleanup trail rows failed', trailErr.message);
      return;
    }
    const toRemove = collectOrphanTrailIds(openIds, trailRows ?? []);
    let deleted = 0;
    for (const oid of toRemove) {
      const { error: delErr } = await supabase.from('trail_stop_state').delete().eq('oanda_trade_id', oid);
      if (!delErr) deleted += 1;
    }
    if (deleted > 0) {
      console.log('[TrailStop] Cleaned up', deleted, 'orphaned trail_stop_state row(s)');
    }
  } catch (err) {
    console.warn('[TrailStop] cleanupOrphanedTrailStates', String(err));
  }
}
