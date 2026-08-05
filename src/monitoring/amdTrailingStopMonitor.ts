/**
 * Pip-based exit monitor for engine_amd trades (amd_trail_stop_state).
 * S0: pip trail + OANDA hard SL. S1 (NONE): adds time gate at H11.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../connectors/supabase.js';
import {
  fetchCandleRange,
  getPricing,
  closeTrade,
  getOpenTrades,
  getClosedTradeDetails,
} from '../connectors/oanda.js';
import { logInfo, logError } from '../utils/logger.js';
import { sendTradeClosedAlert } from '../services/telegram/alertTradeClose.js';
import { resolveAmdOandaAccountId } from '../services/amd/resolveAmdOandaAccountId.js';
import {
  evaluateAmdDeadTradeAbort,
  formatAmdDeadTradeAdvisory,
  isAmdDeadTradeAbortEnabled,
} from '../services/amd/amdDeadTradeAbort.js';
import {
  amdTrailExitFired,
  isAmdTrailSplitEnabled,
} from '../services/amd/amdTrailSplit.js';
import {
  AMD_TRAIL_ARM_PIPS,
  AMD_TRAIL_GIVEBACK_PIPS,
} from '../services/amd/amdTrailConstants.js';

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const PIP_SIZE = 0.0001;
const HARD_SL_PIPS = 15;

type TrailStateRow = Record<string, unknown>;

interface AmdExitFlags {
  trailSplitEnabled: boolean;
  deadTradeAbortEnabled: boolean;
}

/** Per-trade SL pips from the trade's own stored hard SL; legacy 15 fallback. */
function slPipsOf(state: TrailStateRow): number {
  const fillPrice = parseFloat(state.fill_price as string);
  const hardSlPrice = parseFloat(state.hard_sl_price as string);
  const derived = Math.abs(fillPrice - hardSlPrice) / PIP_SIZE;
  return Number.isFinite(derived) && derived > 0 ? derived : HARD_SL_PIPS;
}

function supabaseDb(): SupabaseClient {
  return getSupabaseClient();
}

function amdAccountId(): string {
  return resolveAmdOandaAccountId();
}

function directionOf(state: TrailStateRow): 'long' | 'short' {
  return state.direction as 'long' | 'short';
}

function pipsCaptured(direction: 'long' | 'short', fillPrice: number, exitPrice: number): number {
  return direction === 'long'
    ? (exitPrice - fillPrice) / PIP_SIZE
    : (fillPrice - exitPrice) / PIP_SIZE;
}

async function fetchMidPrice(): Promise<number | null> {
  const pricing = await getPricing(INSTRUMENT, amdAccountId());
  if (!pricing.length) return null;
  return (parseFloat(pricing[0].ask) + parseFloat(pricing[0].bid)) / 2;
}

async function updatePeakPrice(tradeId: string, peakPrice: number): Promise<void> {
  await supabaseDb()
    .from('amd_trail_stop_state')
    .update({ peak_favorable_price: peakPrice, updated_at: new Date().toISOString() })
    .eq('oanda_trade_id', tradeId);
}

async function markTrailClosed(tradeId: string): Promise<void> {
  await supabaseDb()
    .from('amd_trail_stop_state')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('oanda_trade_id', tradeId);
}

async function updateTradeLogClosed(
  tradeId: string,
  exitPrice: number,
  pnlR: number,
  pnlDollars: number | null,
  result: string,
  closeReason: string,
  state: TrailStateRow,
  capturedPips: number,
): Promise<void> {
  await supabaseDb()
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      pnl_r: pnlR,
      pnl_dollars: pnlDollars,
      result,
      close_reason: closeReason,
      closed_at: new Date().toISOString(),
    })
    .eq('oanda_trade_id', tradeId)
    .eq('engine_id', ENGINE_ID);
  void sendTradeClosedAlert({
    engineId: ENGINE_ID,
    instrument: INSTRUMENT,
    direction: String(state.direction),
    entryPrice: parseFloat(state.fill_price as string),
    exitPrice,
    pnlPips: capturedPips,
    pnlDollars: pnlDollars ?? 0,
    closeReason,
    durationMinutes: Math.floor(
      (Date.now() - new Date(state.created_at as string).getTime()) / 60000,
    ),
  }).catch(() => {});
}

async function fetchClosedPnl(tradeId: string): Promise<{
  exitPrice: number | null;
  pnlDollars: number | null;
}> {
  const fromTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const closed = await getClosedTradeDetails(tradeId, fromTime, amdAccountId());
  return { exitPrice: closed.exitPrice, pnlDollars: closed.pnlDollars };
}

async function attachCloseCandleMetrics(
  state: TrailStateRow,
  captured: number,
): Promise<void> {
  try {
    const closeTime = new Date().toISOString();
    const entryTime = new Date(state.created_at as string).toISOString();
    const nowCapped = new Date().toISOString();
    const [intra, postExit] = await Promise.all([
      fetchCandleRange(INSTRUMENT, entryTime, closeTime, 'M5'),
      fetchCandleRange(INSTRUMENT, closeTime, nowCapped, 'M5'),
    ]);
    const durationMinutes =
      Math.round(
        ((Date.now() - new Date(state.created_at as string).getTime()) / 60000) * 100,
      ) / 100;
    await supabaseDb()
      .from('bridge_trade_log')
      .update({
        intra_trade_candles: intra,
        post_exit_candles: postExit,
        pnl_pips: captured,
        duration_minutes: durationMinutes,
      })
      .eq('oanda_trade_id', state.oanda_trade_id)
      .eq('engine_id', ENGINE_ID);
  } catch {
    // non-fatal
  }
}

async function finalizeClose(
  state: TrailStateRow,
  exitPrice: number,
  closeReason: string,
): Promise<void> {
  const tradeId = state.oanda_trade_id as string;
  const direction = directionOf(state);
  const fillPrice = parseFloat(state.fill_price as string);
  const captured = pipsCaptured(direction, fillPrice, exitPrice);
  const pnlR = captured / slPipsOf(state);
  let pnlDollars: number | null = null;
  try {
    const closed = await fetchClosedPnl(tradeId);
    pnlDollars = closed.pnlDollars;
  } catch {
    // non-fatal
  }
  const result = pnlR > 0 ? 'win' : pnlR < 0 ? 'loss' : 'breakeven';
  await markTrailClosed(tradeId);
  await updateTradeLogClosed(
    tradeId, exitPrice, pnlR, pnlDollars, result, closeReason, state, captured,
  );
  await attachCloseCandleMetrics(state, captured);
  logInfo('[AmdTrail] Trade closed', { tradeId, direction, closeReason, captured, pnlR, pnlDollars });
}

async function closeAmdTrade(
  state: TrailStateRow,
  exitPrice: number,
  reason: string,
): Promise<void> {
  const tradeId = state.oanda_trade_id as string;
  try {
    await closeTrade(tradeId, undefined, amdAccountId());
  } catch (err) {
    logError('[AmdTrail] closeTrade failed', { tradeId, err: String(err) });
    return;
  }
  await finalizeClose(state, exitPrice, reason);
}

async function fetchStoredTakeProfit(tradeId: string): Promise<number | null> {
  const { data } = await supabaseDb()
    .from('bridge_trade_log')
    .select('take_profit')
    .eq('oanda_trade_id', tradeId)
    .eq('engine_id', ENGINE_ID)
    .maybeSingle();
  const takeProfit = data?.take_profit;
  return takeProfit != null ? Number(takeProfit) : null;
}

function resolveExternalCloseReason(exitPrice: number, storedTakeProfit: number | null): string {
  if (storedTakeProfit == null) return 'hard_sl_external';
  const tolerance = 0.00005;
  return Math.abs(exitPrice - storedTakeProfit) <= tolerance ? 'tp_hit' : 'hard_sl_external';
}

async function handleExternalClose(state: TrailStateRow): Promise<void> {
  const tradeId = state.oanda_trade_id as string;
  const fillPrice = parseFloat(state.fill_price as string);
  const direction = directionOf(state);
  let exitPrice = parseFloat(state.hard_sl_price as string);
  try {
    const closed = await fetchClosedPnl(tradeId);
    if (closed.exitPrice != null) exitPrice = closed.exitPrice;
  } catch {
    // non-fatal
  }
  const storedTakeProfit = await fetchStoredTakeProfit(tradeId);
  const closeReason = resolveExternalCloseReason(exitPrice, storedTakeProfit);
  const captured = pipsCaptured(direction, fillPrice, exitPrice);
  const pnlR = captured / slPipsOf(state);
  let pnlDollars: number | null = null;
  try {
    pnlDollars = (await fetchClosedPnl(tradeId)).pnlDollars;
  } catch {
    // non-fatal
  }
  const result = pnlR > 0 ? 'win' : pnlR < 0 ? 'loss' : 'breakeven';
  await markTrailClosed(tradeId);
  await updateTradeLogClosed(
    tradeId, exitPrice, pnlR, pnlDollars, result, closeReason, state, captured,
  );
  await attachCloseCandleMetrics(state, captured);
  logInfo('[AmdTrail] External close reconciled', { tradeId, pnlR, result, closeReason });
}

/** Shadow would_abort logged once per trade — avoids one line per 30s cycle on a dead trade. */
const deadTradeShadowLoggedTradeIds = new Set<string>();

/**
 * Dead-trade abort check — LAST in the exit priority chain, only reached
 * when neither the time gate nor the pip trail closed the trade this cycle.
 * Kill-switched via amd_dead_trade_abort_enabled; shadow-logs while OFF.
 */
async function maybeDeadTradeAbort(
  state: TrailStateRow,
  currentPrice: number,
  abortEnabled: boolean,
): Promise<void> {
  const tradeId = state.oanda_trade_id as string;
  const abort = evaluateAmdDeadTradeAbort({
    direction: directionOf(state),
    fillPrice: parseFloat(state.fill_price as string),
    peakFavorablePrice: parseFloat(state.peak_favorable_price as string),
    createdAt: state.created_at as string,
  });
  if (!abort.shouldAbort || abort.abortReason == null) return;

  if (!abortEnabled) {
    if (!deadTradeShadowLoggedTradeIds.has(tradeId)) {
      deadTradeShadowLoggedTradeIds.add(tradeId);
      logInfo('[AmdTrail] dead-trade would_abort (kill switch OFF)', {
        tradeId,
        advisory: formatAmdDeadTradeAdvisory(abort, 'would_abort'),
      });
    }
    return;
  }

  logInfo('[AmdTrail] dead-trade ABORT (kill switch ON)', {
    tradeId,
    advisory: formatAmdDeadTradeAdvisory(abort, 'abort'),
  });
  await closeAmdTrade(state, currentPrice, abort.abortReason);
}

async function processOpenState(
  state: TrailStateRow,
  oandaOpenIds: Set<string>,
  currentPrice: number,
  nowUtcHour: number,
  flags: AmdExitFlags,
): Promise<void> {
  const tradeId = state.oanda_trade_id as string;
  if (!oandaOpenIds.has(tradeId)) {
    logInfo('[AmdTrail] Trade closed externally on OANDA', { tradeId });
    await handleExternalClose(state);
    return;
  }
  const direction = directionOf(state);
  const fillPrice = parseFloat(state.fill_price as string);
  let peakPrice = parseFloat(state.peak_favorable_price as string);
  const legacyTrailPips = parseFloat(state.trail_pip_distance as string);
  const timeGateHour = state.time_gate_utc_hour as number | null;
  const exitStrategy = state.exit_strategy as string;
  if (direction === 'long' && currentPrice > peakPrice) {
    peakPrice = currentPrice;
    await updatePeakPrice(tradeId, peakPrice);
  } else if (direction === 'short' && currentPrice < peakPrice) {
    peakPrice = currentPrice;
    await updatePeakPrice(tradeId, peakPrice);
  }
  if (exitStrategy === 'S1' && timeGateHour != null && nowUtcHour >= timeGateHour) {
    logInfo('[AmdTrail] Time gate reached', { tradeId, timeGateHour, nowUtcHour });
    await closeAmdTrade(state, currentPrice, 'time_gate');
    return;
  }
  const armPips = flags.trailSplitEnabled ? AMD_TRAIL_ARM_PIPS : legacyTrailPips;
  const givebackPips = flags.trailSplitEnabled ? AMD_TRAIL_GIVEBACK_PIPS : legacyTrailPips;
  if (amdTrailExitFired(direction, fillPrice, peakPrice, currentPrice, armPips, givebackPips)) {
    logInfo('[AmdTrail] Pip trail fired', {
      tradeId, direction, currentPrice, peakPrice, armPips, givebackPips,
    });
    await closeAmdTrade(state, currentPrice, 'pip_trail');
    return;
  }
  await maybeDeadTradeAbort(state, currentPrice, flags.deadTradeAbortEnabled);
}

function isTrailEligibleState(state: Record<string, unknown>): boolean {
  const legType = state.leg_type as string | null;
  return legType === null || legType === 'trail';
}

export async function runAmdTrailMonitor(): Promise<void> {
  const accountId = amdAccountId();
  let oandaOpenIds: Set<string>;
  try {
    oandaOpenIds = new Set((await getOpenTrades(accountId)).map((tradeRow) => tradeRow.id));
  } catch (err) {
    logError('[AmdTrail] getOpenTrades failed — skipping cycle', { err: String(err) });
    return;
  }

  const { data: openStates, error } = await supabaseDb()
    .from('amd_trail_stop_state')
    .select('*')
    .eq('status', 'open');
  if (error) {
    logError('[AmdTrail] Failed to fetch open states', { error: error.message });
    return;
  }
  const trailEligibleStates = (openStates ?? []).filter(isTrailEligibleState);
  if (!trailEligibleStates.length) return;

  let currentPrice: number | null;
  try {
    currentPrice = await fetchMidPrice();
  } catch (err) {
    logError('[AmdTrail] getPricing failed — skipping cycle', { err: String(err) });
    return;
  }
  if (currentPrice == null) {
    logError('[AmdTrail] getPricing returned empty');
    return;
  }
  // Read once per cycle (not once per open state) — same pattern as AO's monitor.
  const flags: AmdExitFlags = {
    trailSplitEnabled: await isAmdTrailSplitEnabled(supabaseDb()),
    deadTradeAbortEnabled: await isAmdDeadTradeAbortEnabled(supabaseDb()),
  };
  const nowUtcHour = new Date().getUTCHours();
  for (const state of trailEligibleStates) {
    await processOpenState(
      state as TrailStateRow, oandaOpenIds, currentPrice, nowUtcHour, flags,
    );
  }
}
