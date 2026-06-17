import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades, placeMarketOrder } from '../connectors/oanda.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { sendMultiLegExecutedAlert } from './telegram/alertMultiLegExecuted.js';
import { sendRatchetUnprotectedLegAlert } from './telegram/alertRatchetUnprotectedLeg.js';
import {
  computeAmdFailedRatchetLegs,
  type AmdRatchetLeg,
} from './amdDetector/amdFailedRatchetSplit.js';

const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const HARD_SL_PIPS = 15;
const BASELINE_RISK_PCT = 0.02;
export const AMD_FAILED_TRAIL_PIPS = 2.0;

type TradeDirection = 'long' | 'short';
type AmdStateRow = Record<string, unknown>;

export type AmdOrderPlan = {
  entryPrice: number;
  hardSlPrice: number;
  signedUnits: number;
  equity: number;
  weight: number;
};

type ExecutedLeg = {
  legType: string;
  units: number;
  fillPrice: number;
  takeProfitPrice: string | null;
  oandaTradeId: string;
};

type FillParseResult = {
  tradeId: string | null;
  fillPrice: number | null;
  takeProfitOrderId: string | null;
};

type OandaPlaceOrderResponse = Awaited<ReturnType<typeof placeMarketOrder>> & {
  takeProfitOrderTransaction?: { id?: string };
};

function parseFillFromOrder(orderResult: OandaPlaceOrderResponse): FillParseResult {
  const fillTx = orderResult.orderFillTransaction;
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id ?? null;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
  const takeProfitOrderId = orderResult.takeProfitOrderTransaction?.id ?? null;
  return { tradeId, fillPrice, takeProfitOrderId };
}

async function confirmTakeProfitOnOpenTrade(tradeId: string): Promise<string | null> {
  try {
    const openTrades = await getOpenTrades();
    return openTrades.find((trade) => trade.id === tradeId)?.takeProfitOrderID ?? null;
  } catch {
    return null;
  }
}

function alertUnprotectedRatchetLeg(
  leg: AmdRatchetLeg,
  direction: TradeDirection,
  tradeId: string,
): void {
  logError('[AmdDistribution] Ratchet leg filled but TP order not confirmed — unprotected position', {
    legType: leg.legType,
    tradeId,
    requestedTakeProfit: leg.takeProfitPrice,
  });
  void sendRatchetUnprotectedLegAlert({
    instrument: INSTRUMENT,
    direction: direction.toUpperCase(),
    legType: leg.legType,
    tradeId,
    requestedTakeProfit: leg.takeProfitPrice!,
    units: leg.units,
  }).catch(() => {});
}

async function persistRatchetTradeLog(
  supabaseDb: SupabaseClient,
  leg: AmdRatchetLeg,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  plan: AmdOrderPlan,
  fillPrice: number,
  tradeId: string,
  executionNotes: string | null,
): Promise<void> {
  await supabaseDb.from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    pair: INSTRUMENT,
    direction: direction.toUpperCase(),
    stop_loss: plan.hardSlPrice,
    take_profit: leg.takeProfitPrice ? parseFloat(leg.takeProfitPrice) : null,
    entry_price: fillPrice,
    fill_price: fillPrice,
    units: leg.units,
    oanda_trade_id: tradeId,
    leg_type: leg.legType,
    signal_received_at: new Date().toISOString(),
    decision: 'EXECUTED',
    status: 'open',
    account_equity_at_signal: plan.equity,
    risk_amount: plan.equity * plan.weight * BASELINE_RISK_PCT,
    amd_tag: 'AMD_FAILED',
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
    direction_source: 'amd_auto_direction',
    reversal_confirmed: amdRow.reversal_confirmed,
    auto_direction_reason: amdRow.auto_direction_reason,
    amd_size_multiplier: amdRow.amd_size_multiplier ?? null,
    amd_entry_hour: new Date().getUTCHours(),
    amd_exit_strategy: 'S0',
    amd_pip_trail: leg.legType === 'trail' ? AMD_FAILED_TRAIL_PIPS : null,
    amd_hard_sl_pips: HARD_SL_PIPS,
    ...(executionNotes && { notes: executionNotes }),
  });
}

async function persistRatchetTrailState(
  supabaseDb: SupabaseClient,
  leg: AmdRatchetLeg,
  direction: TradeDirection,
  fillPrice: number,
  plan: AmdOrderPlan,
  tradeId: string,
  todayStr: string,
): Promise<void> {
  if (leg.legType !== 'trail') return;
  await supabaseDb.from('amd_trail_stop_state').insert({
    oanda_trade_id: tradeId,
    engine_id: ENGINE_ID,
    direction,
    fill_price: fillPrice,
    hard_sl_price: plan.hardSlPrice,
    trail_pip_distance: AMD_FAILED_TRAIL_PIPS,
    peak_favorable_price: fillPrice,
    time_gate_utc_hour: null,
    trade_date: todayStr,
    amd_tag: 'AMD_FAILED',
    exit_strategy: 'S0',
    leg_type: 'trail',
    status: 'open',
  });
}

async function placeRatchetLegOrder(
  leg: AmdRatchetLeg,
  plan: AmdOrderPlan,
): Promise<Awaited<ReturnType<typeof placeMarketOrder>> | null> {
  try {
    return await placeMarketOrder({
      instrument: INSTRUMENT,
      units: leg.units,
      stopLossPrice: plan.hardSlPrice.toFixed(5),
      ...(leg.takeProfitPrice && { takeProfitPrice: leg.takeProfitPrice }),
    });
  } catch (err) {
    logError('[AmdDistribution] Ratchet leg order failed — skipping leg, continuing', {
      legType: leg.legType,
      err: String(err),
    });
    return null;
  }
}

async function resolveTakeProfitConfirmation(
  leg: AmdRatchetLeg,
  tradeId: string,
  fillTpId: string | null,
): Promise<{ takeProfitOrderId: string | null; tpUnconfirmed: boolean }> {
  let takeProfitOrderId = fillTpId;
  if (leg.takeProfitPrice && !takeProfitOrderId) {
    takeProfitOrderId = await confirmTakeProfitOnOpenTrade(tradeId);
  }
  return {
    takeProfitOrderId,
    tpUnconfirmed: Boolean(leg.takeProfitPrice && !takeProfitOrderId),
  };
}

async function recordExecutedRatchetLeg(
  supabaseDb: SupabaseClient,
  leg: AmdRatchetLeg,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  plan: AmdOrderPlan,
  fillPrice: number,
  tradeId: string,
  todayStr: string,
  tpUnconfirmed: boolean,
): Promise<ExecutedLeg> {
  await persistRatchetTradeLog(
    supabaseDb,
    leg,
    direction,
    amdRow,
    plan,
    fillPrice,
    tradeId,
    tpUnconfirmed ? 'TP_UNCONFIRMED' : null,
  );
  await persistRatchetTrailState(supabaseDb, leg, direction, fillPrice, plan, tradeId, todayStr);
  return {
    legType: leg.legType,
    units: leg.units,
    fillPrice,
    takeProfitPrice: leg.takeProfitPrice,
    oandaTradeId: tradeId,
  };
}

async function processRatchetLeg(
  supabaseDb: SupabaseClient,
  leg: AmdRatchetLeg,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  plan: AmdOrderPlan,
  todayStr: string,
): Promise<ExecutedLeg | null> {
  if (leg.units === 0) {
    logWarn('[AmdDistribution] Skipping zero-unit ratchet leg', {
      legType: leg.legType,
      totalUnits: plan.signedUnits,
    });
    return null;
  }
  const orderResult = await placeRatchetLegOrder(leg, plan);
  if (!orderResult) return null;
  const { tradeId, fillPrice: oandaFill, takeProfitOrderId: fillTpId } = parseFillFromOrder(orderResult);
  if (!tradeId) {
    logError('[AmdDistribution] Ratchet leg — no tradeId, skipping leg', { legType: leg.legType });
    return null;
  }
  const { tpUnconfirmed } = await resolveTakeProfitConfirmation(leg, tradeId, fillTpId);
  if (tpUnconfirmed) {
    alertUnprotectedRatchetLeg(leg, direction, tradeId);
  }
  const fillPrice = oandaFill ?? plan.entryPrice;
  return recordExecutedRatchetLeg(
    supabaseDb,
    leg,
    direction,
    amdRow,
    plan,
    fillPrice,
    tradeId,
    todayStr,
    tpUnconfirmed,
  );
}

export async function submitAmdFailedRatchetOrder(
  supabaseDb: SupabaseClient,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  plan: AmdOrderPlan,
  todayStr: string,
): Promise<void> {
  const legs = computeAmdFailedRatchetLegs(plan.signedUnits, plan.entryPrice, direction);
  const executedLegs: ExecutedLeg[] = [];
  for (const leg of legs) {
    const executed = await processRatchetLeg(supabaseDb, leg, direction, amdRow, plan, todayStr);
    if (executed) executedLegs.push(executed);
  }
  if (executedLegs.length === 0) return;
  logInfo('[AmdDistribution] AMD_FAILED ratchet executed', { legs: executedLegs.length });
  void sendMultiLegExecutedAlert({
    instrument: INSTRUMENT,
    direction: direction.toUpperCase(),
    legs: executedLegs,
    engineLabel: 'AMD_FAILED Ratchet',
    trailMarkerLabel: '7p marker',
  }).catch(() => {});
}
