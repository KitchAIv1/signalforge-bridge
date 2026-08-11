/**
 * AMD OANDA peer leg — place + persist + trail. Independent of the VT leg.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandleRange, placeMarketOrder } from '../../connectors/oanda.js';
import { logError, logInfo } from '../../utils/logger.js';
import { sendTradeExecutedAlert } from '../telegram/alertTradeExecution.js';
import type { AmdDistributionOrderPlan, AmdTradeDirection } from './buildAmdDistributionOrderPlan.js';
import { AMD_PIP_TRAIL_PIPS } from './amdTrailConstants.js';
import { hasAmdVenueExecutedToday } from './amdVenueExecutedToday.js';
import { AMD_BROKER_ID, resolveAmdOandaAccountId } from './resolveAmdOandaAccountId.js';
import { computeAmdRiskAmount } from './resolveAmdSizeMultiplier.js';

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const BASELINE_RISK_PCT = 0.02;

export interface PlaceAmdOandaLegParams {
  supabase: SupabaseClient;
  tag: string;
  direction: AmdTradeDirection;
  amdRow: Record<string, unknown>;
  plan: AmdDistributionOrderPlan;
  exitStrategy: string;
  todayStr: string;
  timeGateUtcHour: number | null;
}

function parseFillFromOrder(orderResult: Awaited<ReturnType<typeof placeMarketOrder>>): {
  tradeId: string | null;
  fillPrice: number | null;
} {
  const fillTx = orderResult.orderFillTransaction;
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id ?? null;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
  return { tradeId, fillPrice };
}

async function writeOandaBlockedLog(
  supabase: SupabaseClient,
  reason: string,
  tag: string,
  amdRow: Record<string, unknown>,
  stopLoss: number,
  direction: string,
): Promise<void> {
  const { error } = await supabase.from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_BROKER_ID,
    pair: INSTRUMENT,
    direction,
    stop_loss: stopLoss,
    signal_received_at: new Date().toISOString(),
    decision: 'BLOCKED',
    block_reason: reason,
    status: 'pending',
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
  });
  if (error) {
    logError('[AmdOandaLeg] BLOCKED log insert failed', { reason, error: error.message });
  }
}

async function persistOandaOpenTrade(
  params: PlaceAmdOandaLegParams,
  fillPrice: number,
  tradeId: string,
): Promise<void> {
  const { supabase, tag, direction, amdRow, plan, exitStrategy } = params;
  const riskAmount = computeAmdRiskAmount(
    plan.equity,
    plan.weight,
    plan.sizeMultiplier,
    BASELINE_RISK_PCT,
  );
  const { error } = await supabase.from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_BROKER_ID,
    pair: INSTRUMENT,
    direction: direction.toUpperCase(),
    stop_loss: plan.hardSlPrice,
    entry_price: fillPrice,
    fill_price: fillPrice,
    units: plan.signedUnits,
    oanda_trade_id: tradeId,
    signal_received_at: new Date().toISOString(),
    decision: 'EXECUTED',
    status: 'open',
    account_equity_at_signal: plan.equity,
    risk_amount: riskAmount,
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
    direction_source: 'amd_auto_direction',
    reversal_confirmed: amdRow.reversal_confirmed,
    auto_direction_reason: amdRow.auto_direction_reason,
    amd_size_multiplier: plan.sizeMultiplier,
    amd_entry_hour: new Date().getUTCHours(),
    amd_exit_strategy: exitStrategy,
    amd_pip_trail: AMD_PIP_TRAIL_PIPS,
    amd_hard_sl_pips: plan.hardSlPips,
  });
  if (error) {
    logError('[AmdOandaLeg] EXECUTED log insert failed after fill', {
      tradeId,
      error: error.message,
    });
  }
}

async function persistOandaTrailState(
  params: PlaceAmdOandaLegParams,
  fillPrice: number,
  tradeId: string,
): Promise<void> {
  const { supabase, tag, direction, plan, exitStrategy, todayStr, timeGateUtcHour } = params;
  const { error } = await supabase.from('amd_trail_stop_state').insert({
    oanda_trade_id: tradeId,
    broker_id: AMD_BROKER_ID,
    engine_id: ENGINE_ID,
    direction,
    fill_price: fillPrice,
    hard_sl_price: plan.hardSlPrice,
    trail_pip_distance: AMD_PIP_TRAIL_PIPS,
    peak_favorable_price: fillPrice,
    time_gate_utc_hour: timeGateUtcHour,
    trade_date: todayStr,
    amd_tag: tag,
    exit_strategy: exitStrategy,
    status: 'open',
  });
  if (error) {
    logError('[AmdOandaLeg] trail state insert failed after fill', {
      tradeId,
      error: error.message,
    });
  }
}

async function captureOandaPreEntryCandles(
  supabase: SupabaseClient,
  tradeId: string,
): Promise<void> {
  try {
    const now = new Date();
    const preFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const preTo = now.toISOString();
    const h1From = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const [preM5, preH1] = await Promise.all([
      fetchCandleRange(INSTRUMENT, preFrom, preTo, 'M5'),
      fetchCandleRange(INSTRUMENT, h1From, preTo, 'H1'),
    ]);
    await supabase
      .from('bridge_trade_log')
      .update({ pre_entry_candles: preM5, h1_session_candles: preH1 })
      .eq('oanda_trade_id', tradeId)
      .eq('engine_id', ENGINE_ID);
  } catch {
    // non-fatal — candle capture never blocks trade logging
  }
}

async function finalizeOandaFill(
  params: PlaceAmdOandaLegParams,
  tradeId: string,
  fillPrice: number,
): Promise<void> {
  const { tag, direction, plan } = params;
  logInfo('[AmdOandaLeg] Order filled', { tradeId, fillPrice, tag, direction });
  await persistOandaOpenTrade(params, fillPrice, tradeId);
  void sendTradeExecutedAlert({
    oandaInstrument: INSTRUMENT,
    direction: direction.toUpperCase(),
    fillPrice,
    stopLoss: plan.hardSlPrice,
    takeProfit: null,
    filledUnits: Math.abs(plan.signedUnits),
    amdTag: tag,
    amdSizeMultiplier: plan.sizeMultiplier,
    directionSource: 'auto',
    engineId: ENGINE_ID,
  }).catch(() => {});
  await persistOandaTrailState(params, fillPrice, tradeId);
  await captureOandaPreEntryCandles(params.supabase, tradeId);
}

/** Place AMD on OANDA; skip if this venue already EXECUTED today. */
export async function placeAmdOandaLeg(params: PlaceAmdOandaLegParams): Promise<void> {
  const { supabase, tag, direction, plan, amdRow, todayStr, exitStrategy } = params;
  if (await hasAmdVenueExecutedToday(supabase, AMD_BROKER_ID, todayStr)) {
    logInfo('[AmdOandaLeg] Already EXECUTED today — skipping OANDA leg');
    return;
  }
  logInfo('[AmdOandaLeg] Placing order', {
    tag,
    direction,
    entryPrice: plan.entryPrice,
    hardSlPrice: plan.hardSlPrice,
    units: plan.signedUnits,
    sizeMultiplier: plan.sizeMultiplier,
    exitStrategy,
  });
  const orderResult = await placeMarketOrder(
    {
      instrument: INSTRUMENT,
      units: plan.signedUnits,
      stopLossPrice: plan.hardSlPrice.toFixed(5),
    },
    10_000,
    resolveAmdOandaAccountId(),
  );
  const { tradeId, fillPrice: oandaFill } = parseFillFromOrder(orderResult);
  if (!tradeId) {
    logError('[AmdOandaLeg] OANDA order failed — no tradeId', { orderResult });
    await writeOandaBlockedLog(
      supabase,
      'OANDA_ERROR: no tradeId',
      tag,
      amdRow,
      plan.hardSlPrice,
      direction.toUpperCase(),
    );
    return;
  }
  await finalizeOandaFill(params, tradeId, oandaFill ?? plan.entryPrice);
}
