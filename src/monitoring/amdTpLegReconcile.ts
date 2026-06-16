/**
 * AMD_FAILED ratchet T1/T2 legs live only in bridge_trade_log (not amd_trail_stop_state).
 * Reconcile OANDA TP/SL fills here — same monitor family as amdTrailingStopMonitor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandleRange, getClosedTradeDetails } from '../connectors/oanda.js';
import { logInfo, logError } from '../utils/logger.js';
import { sendTradeClosedAlert } from '../services/telegram/alertTradeClose.js';

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const PIP_SIZE = 0.0001;
const HARD_SL_PIPS = 15;
const MIN_OPEN_AGE_MS = 60_000;
const TP_TOLERANCE = 0.00005;

type TpLegLogRow = Record<string, unknown>;

function tradeDirectionOf(row: TpLegLogRow): 'long' | 'short' {
  const raw = String(row.direction ?? '').toLowerCase();
  return raw === 'short' ? 'short' : 'long';
}

function pipsCaptured(direction: 'long' | 'short', fillPrice: number, exitPrice: number): number {
  return direction === 'long'
    ? (exitPrice - fillPrice) / PIP_SIZE
    : (fillPrice - exitPrice) / PIP_SIZE;
}

function resolveTpCloseReason(exitPrice: number, storedTakeProfit: number | null): string {
  if (storedTakeProfit == null) return 'hard_sl_external';
  return Math.abs(exitPrice - storedTakeProfit) <= TP_TOLERANCE ? 'tp_hit' : 'hard_sl_external';
}

async function fetchOpenAmdTpLegs(supabase: SupabaseClient): Promise<TpLegLogRow[]> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('id, oanda_trade_id, direction, fill_price, take_profit, signal_received_at')
    .eq('engine_id', ENGINE_ID)
    .eq('status', 'open')
    .in('leg_type', ['tp1', 'tp2']);
  if (error) {
    logError('[AmdTrail] Failed to fetch open TP legs', { error: error.message });
    return [];
  }
  return (data ?? []) as TpLegLogRow[];
}

async function attachTpLegCloseMetrics(
  supabase: SupabaseClient,
  tradeId: string,
  entryTime: string,
  captured: number,
): Promise<void> {
  try {
    const closeTime = new Date().toISOString();
    const [intra, postExit] = await Promise.all([
      fetchCandleRange(INSTRUMENT, entryTime, closeTime, 'M5'),
      fetchCandleRange(INSTRUMENT, closeTime, closeTime, 'M5'),
    ]);
    const durationMinutes =
      Math.round(((Date.now() - new Date(entryTime).getTime()) / 60000) * 100) / 100;
    await supabase
      .from('bridge_trade_log')
      .update({
        intra_trade_candles: intra,
        post_exit_candles: postExit,
        pnl_pips: captured,
        duration_minutes: durationMinutes,
      })
      .eq('oanda_trade_id', tradeId)
      .eq('engine_id', ENGINE_ID);
  } catch {
    // non-fatal
  }
}

async function finalizeTpLegClose(
  supabase: SupabaseClient,
  row: TpLegLogRow,
  exitPrice: number,
  closeReason: string,
): Promise<void> {
  const tradeId = row.oanda_trade_id as string;
  const direction = tradeDirectionOf(row);
  const fillPrice = parseFloat(String(row.fill_price));
  const entryTime = row.signal_received_at as string;
  const captured = pipsCaptured(direction, fillPrice, exitPrice);
  const pnlR = captured / HARD_SL_PIPS;
  const closed = await getClosedTradeDetails(tradeId, entryTime);
  const pnlDollars = closed.pnlDollars;
  const result = pnlR > 0 ? 'win' : pnlR < 0 ? 'loss' : 'breakeven';
  await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      pnl_r: pnlR,
      pnl_dollars: pnlDollars,
      result,
      close_reason: closeReason,
      closed_at: closed.closedTime ?? new Date().toISOString(),
    })
    .eq('id', row.id);
  void sendTradeClosedAlert({
    engineId: ENGINE_ID,
    instrument: INSTRUMENT,
    direction: String(row.direction),
    entryPrice: fillPrice,
    exitPrice,
    pnlPips: captured,
    pnlDollars: pnlDollars ?? 0,
    closeReason,
    durationMinutes: Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000),
  }).catch(() => {});
  await attachTpLegCloseMetrics(supabase, tradeId, entryTime, captured);
  logInfo('[AmdTrail] TP leg closed', { tradeId, closeReason, captured, pnlR, pnlDollars });
}

async function reconcileOneTpLeg(
  supabase: SupabaseClient,
  row: TpLegLogRow,
  oandaOpenIds: Set<string>,
): Promise<void> {
  const tradeId = row.oanda_trade_id as string;
  if (oandaOpenIds.has(tradeId)) return;
  const entryTime = row.signal_received_at as string;
  if (Date.now() - new Date(entryTime).getTime() < MIN_OPEN_AGE_MS) return;
  const closed = await getClosedTradeDetails(tradeId, entryTime);
  const exitPrice = closed.exitPrice ?? parseFloat(String(row.fill_price));
  const storedTakeProfit = row.take_profit != null ? Number(row.take_profit) : null;
  const closeReason = resolveTpCloseReason(exitPrice, storedTakeProfit);
  await finalizeTpLegClose(supabase, row, exitPrice, closeReason);
}

export async function reconcileAmdTpLegCloses(
  supabase: SupabaseClient,
  oandaOpenIds: Set<string>,
): Promise<void> {
  const openTpLegs = await fetchOpenAmdTpLegs(supabase);
  for (const row of openTpLegs) {
    await reconcileOneTpLeg(supabase, row, oandaOpenIds);
  }
}
