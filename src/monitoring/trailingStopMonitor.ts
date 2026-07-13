/**
 * Trailing stop for configured bridge engines (e.g. charlie, charlie_shadow).
 * State in trail_stop_state; driven by trade monitor cadence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLatestM5Candle, getPricing } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import { resolveBrokerForLogRow } from '../services/broker/resolveBrokerForLogRow.js';
import { closeTradeViaBroker } from './brokerTradeLifecycle.js';
import { computeDerivedFields, resultFromPnl } from './tradeMonitorHelpers.js';
import { fetchCloseCandles } from './closeCandleCapture.js';
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
import { loadOmegaTrailPeakGivebackPips } from '../core/omegaRawPolicy/omegaRawTrailGiveback.js';

const candleFetchFailures = new Map<string, number>();
const CANDLE_FAILURE_ALERT_THRESHOLD = 5;

async function resolveTrailLiveMidForExit(instrument: string): Promise<number | null> {
  try {
    const liveQuotes = await getPricing(instrument);
    const quote = liveQuotes[0];
    if (!quote) {
      console.warn(
        '[TrailStop] getPricing returned no quote for',
        instrument,
        '— skipping exit check this cycle'
      );
      return null;
    }
    const liveMid = (parseFloat(quote.bid) + parseFloat(quote.ask)) / 2;
    if (!Number.isFinite(liveMid) || liveMid <= 0) {
      console.warn('[TrailStop] liveMid invalid for', instrument, '— skipping exit check this cycle');
      return null;
    }
    return liveMid;
  } catch {
    console.warn('[TrailStop] getPricing failed for', instrument, '— skipping exit check this cycle');
    return null;
  }
}

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

    const engineId = row.engine_id != null ? String(row.engine_id) : '';
    const peakGivebackPips =
      engineId === 'omega' ? await loadOmegaTrailPeakGivebackPips(supabase) : null;
    const metrics = computeTrailInsertFields(row, {
      omegaPeakGivebackPips: peakGivebackPips,
    });
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
      )} rSize=${metrics.rSizeRaw} trailDist=${metrics.trailDistance}` +
        (peakGivebackPips != null ? ` givebackPips=${peakGivebackPips}` : ''),
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

  // Candle: peak tracking + activation threshold (full closed-bar excursion).
  const { favorable: candleFavorable } = favorableAndAdverse(state.direction, fillPrice, candle);

  // Live mid: exit decisions only — avoids stale-candle premature closes.
  const liveMid = await resolveTrailLiveMidForExit(instrument);
  if (liveMid === null) return NO_TRAIL_CLOSE;

  const { favorable: liveFavorable, adverse: liveAdverse } = favorableAndAdverse(
    state.direction,
    fillPrice,
    { high: liveMid, low: liveMid }
  );

  if (liveAdverse >= state.sl_distance && !state.trail_activated) {
    return { shouldClose: true, reason: 'trail_sl_hit', pnlR: -getSlMultiplier() };
  }

  const nowActivated = state.trail_activated || candleFavorable >= state.activation_threshold;

  const peakFavorable = await applyTrailPeakUpdates(
    supabase,
    oandaTradeId,
    state,
    nowActivated,
    candleFavorable
  );

  const exitDecision = evaluateTrailExitDecision(
    state,
    nowActivated,
    peakFavorable,
    liveFavorable,
    liveAdverse
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

  // ── Candle intelligence capture — omega only ────────────────────────────
  const candleUpdate: Record<string, unknown> = {};
  if ((logRow.engine_id as string) === 'omega') {
    const entryIso = signalReceivedAt ?? (logRow.created_at as string);
    if (entryIso) {
      const { intraTradeCandles, postExitCandles } = await fetchCloseCandles(
        logRow.pair as string,
        entryIso,
        closedAt
      );
      if (intraTradeCandles.length > 0) candleUpdate.intra_trade_candles = intraTradeCandles;
      if (postExitCandles.length > 0) candleUpdate.post_exit_candles = postExitCandles;
    }
  }
  // ── End candle capture ─────────────────────────────────────────────────

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
  await supabase.from('trail_stop_state').delete().eq('oanda_trade_id', oandaTradeId);
}

export async function closeTrailStop(
  supabase: SupabaseClient,
  oandaTradeId: string,
  logRowId: string,
  logRow: Record<string, unknown>,
  reason: string
): Promise<void> {
  const engineId = String(logRow.engine_id ?? 'omega');
  const brokerId = logRow.broker_id as string | null | undefined;
  try {
    const broker = await resolveBrokerForLogRow(supabase, brokerId, engineId);
    const { closedAt, pnlDollars, exitPriceNum } = await closeTradeViaBroker(broker, oandaTradeId);
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
      'broker=',
      broker.brokerId,
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
