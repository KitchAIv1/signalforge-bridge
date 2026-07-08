/**
 * AMD Distribution Engine — one OANDA trade per day at tag entry hour.
 * Pip-based hard SL on OANDA; exit via amdTrailingStopMonitor (not Omega trail).
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../connectors/supabase.js';
import {
  fetchCandleRange,
  getAccountSummary,
  getPricing,
  placeMarketOrder,
} from '../connectors/oanda.js';
import { calculateUnits } from '../core/positionSizer.js';
import { logInfo, logError } from '../utils/logger.js';
import { sendTradeExecutedAlert } from './telegram/alertTradeExecution.js';
import { loadAmdAsianCloseFilterEnabled } from './amd/loadAmdAsianCloseFilterEnabled.js';
import {
  AMD_BROKER_ID,
  resolveAmdOandaAccountId,
} from './amd/resolveAmdOandaAccountId.js';
import { AMD_HARD_SL_PIPS, AMD_PIP_TRAIL_PIPS } from './amd/amdTrailConstants.js';

const TAG_ENTRY_HOUR: Record<string, number> = {
  AMD_COMPRESSION_BREAKOUT: 10,
  AMD_NONE: 10,
  AMD_FAILED: 11,
  AMD_TEXTBOOK: 12,
  AMD_SHIFTED: 12,
};

const TAGS_REQUIRING_AMD_CONFIRMED = new Set([
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_NONE',
]);

const TAG_HARD_EXIT_HOUR: Record<string, number> = {
  // AMD_NONE: tight 30-min window validated (+67%
  //   with gate). Hard exit at H11 is correct.
  AMD_NONE: 11,
  // AMD_TEXTBOOK: marginal pip loss (-7%) but
  //   +11pp win rate improvement. Keep gate.
  AMD_TEXTBOOK: 13,
  // AMD_COMPRESSION: gate removed (-25% damage).
  //   Trail runs freely. Hard exit only as safety.
  AMD_COMPRESSION_BREAKOUT: 16,
  // AMD_FAILED: gate removed (-90% damage).
  //   D1 direction on trending days produces
  //   large moves that extend past H12.
  AMD_FAILED: 16,
  // AMD_SHIFTED: gate removed (-55% damage).
  //   Trail runs freely until 16:00 UTC.
  AMD_SHIFTED: 16,
};

const TAG_TIME_GATE_HOUR: Record<string, number | null> = {
  AMD_NONE: 11,
};

const HARD_SL_PIPS = AMD_HARD_SL_PIPS;
const INSTRUMENT = 'AUD_USD';
const ENGINE_ID = 'engine_amd';
const BASELINE_RISK_PCT = 0.02;

type AmdStateRow = Record<string, unknown>;
type TradeDirection = 'long' | 'short';

function supabaseDb(): SupabaseClient {
  return getSupabaseClient();
}

function isEnabled(): boolean {
  return process.env.AMD_DISTRIBUTION_ENABLED === 'true';
}

function utcNowParts(): { todayStr: string; hourUtc: number; minUtc: number } {
  const nowUtc = new Date();
  return {
    todayStr: nowUtc.toISOString().slice(0, 10),
    hourUtc: nowUtc.getUTCHours(),
    minUtc: nowUtc.getUTCMinutes(),
  };
}

function effectiveTag(amdRow: AmdStateRow): string {
  const overrideTag = amdRow.amd_tag_manual_override as string | null;
  return overrideTag ?? (amdRow.amd_tag as string);
}

function isEntryWindowOpen(tag: string, hourUtc: number, minUtc: number): boolean {
  const hardExit = TAG_HARD_EXIT_HOUR[tag] ?? 13;
  if (hourUtc >= hardExit) return false;
  if (TAGS_REQUIRING_AMD_CONFIRMED.has(tag)) {
    if (hourUtc === 10 && minUtc >= 31) return true;
    if (hourUtc === 10 && minUtc < 31) return false;
    return hourUtc > 10 && hourUtc < hardExit;
  }
  return hourUtc >= (TAG_ENTRY_HOUR[tag] ?? 12);
}

async function loadTodayAmdState(todayStr: string): Promise<AmdStateRow | null> {
  const { data, error } = await supabaseDb()
    .from('amd_state')
    .select(
      'amd_tag, amd_tag_manual_override, auto_direction, decision_auto_direction, daily_bias_alignment, ' +
        'layer4_d1_bias, evaluated_at, judas_direction, auto_direction_reason, ' +
        'amd_size_multiplier, reversal_confirmed, ' +
        'asian_close_bias_signal, asian_close_position_pct',
    )
    .eq('pair', INSTRUMENT)
    .eq('trade_date', todayStr)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AmdStateRow;
}

async function hasExecutedToday(todayStr: string): Promise<boolean> {
  const { count } = await supabaseDb()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', ENGINE_ID)
    .eq('decision', 'EXECUTED')
    .gte('created_at', `${todayStr}T00:00:00Z`);
  return (count ?? 0) > 0;
}

async function hasBlockedToday(
  todayStr: string,
  blockReason: string,
): Promise<boolean> {
  const { count, error } = await supabaseDb()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', ENGINE_ID)
    .eq('decision', 'BLOCKED')
    .eq('block_reason', blockReason)
    .gte('created_at', `${todayStr}T00:00:00Z`);
  if (error) {
    console.error(`[AmdDistribution] hasBlockedToday error: ${error.message}`);
    return false;
  }
  return (count ?? 0) > 0;
}

async function loadEngineRow(): Promise<{ is_active: boolean; weight: number } | null> {
  const { data } = await supabaseDb()
    .from('bridge_engines')
    .select('is_active, weight')
    .eq('engine_id', ENGINE_ID)
    .maybeSingle();
  return data as { is_active: boolean; weight: number } | null;
}

async function isNewsBlackout(): Promise<boolean> {
  const windowStart = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const { count } = await supabaseDb()
    .from('news_events')
    .select('id', { count: 'exact', head: true })
    .contains('affected_pairs', [INSTRUMENT])
    .gte('event_datetime_utc', windowStart)
    .lte('event_datetime_utc', windowEnd);
  return (count ?? 0) > 0;
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

async function writeBlockedLog(
  reason: string,
  tag: string,
  amdRow: AmdStateRow,
  stopLoss: number,
  direction: string,
): Promise<void> {
  const receivedAt = new Date().toISOString();
  await supabaseDb().from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_BROKER_ID,
    pair: INSTRUMENT,
    direction,
    stop_loss: stopLoss,
    signal_received_at: receivedAt,
    decision: 'BLOCKED',
    block_reason: reason,
    status: 'pending',
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
  });
}

async function persistOpenTrade(
  tag: string,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  fillPrice: number,
  hardSlPrice: number,
  signedUnits: number,
  tradeId: string,
  exitStrategy: string,
  equity: number,
  weight: number,
): Promise<void> {
  const receivedAt = new Date().toISOString();
  const riskAmount = equity * weight * BASELINE_RISK_PCT;
  await supabaseDb().from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: ENGINE_ID,
    broker_id: AMD_BROKER_ID,
    pair: INSTRUMENT,
    direction: direction.toUpperCase(),
    stop_loss: hardSlPrice,
    entry_price: fillPrice,
    fill_price: fillPrice,
    units: signedUnits,
    oanda_trade_id: tradeId,
    signal_received_at: receivedAt,
    decision: 'EXECUTED',
    status: 'open',
    account_equity_at_signal: equity,
    risk_amount: riskAmount,
    amd_tag: tag,
    amd_evaluated_at: amdRow.evaluated_at,
    layer4_d1_bias: amdRow.layer4_d1_bias,
    daily_bias_alignment: amdRow.daily_bias_alignment,
    direction_source: 'amd_auto_direction',
    reversal_confirmed: amdRow.reversal_confirmed,
    auto_direction_reason: amdRow.auto_direction_reason,
    amd_size_multiplier: amdRow.amd_size_multiplier ?? null,
    amd_entry_hour: new Date().getUTCHours(),
    amd_exit_strategy: exitStrategy,
    amd_pip_trail: AMD_PIP_TRAIL_PIPS,
    amd_hard_sl_pips: HARD_SL_PIPS,
  });
}

async function persistTrailState(
  tag: string,
  direction: TradeDirection,
  fillPrice: number,
  hardSlPrice: number,
  tradeId: string,
  exitStrategy: string,
  todayStr: string,
): Promise<void> {
  await supabaseDb().from('amd_trail_stop_state').insert({
    oanda_trade_id: tradeId,
    engine_id: ENGINE_ID,
    direction,
    fill_price: fillPrice,
    hard_sl_price: hardSlPrice,
    trail_pip_distance: AMD_PIP_TRAIL_PIPS,
    peak_favorable_price: fillPrice,
    time_gate_utc_hour: TAG_TIME_GATE_HOUR[tag] ?? null,
    trade_date: todayStr,
    amd_tag: tag,
    exit_strategy: exitStrategy,
    status: 'open',
  });
}

type OrderPlan = {
  entryPrice: number;
  hardSlPrice: number;
  signedUnits: number;
  exitStrategy: string;
  equity: number;
  weight: number;
};

async function buildOrderPlan(direction: TradeDirection, weight: number): Promise<OrderPlan | null> {
  const amdAccountId = resolveAmdOandaAccountId();
  const account = await getAccountSummary(amdAccountId);
  const pricing = await getPricing(INSTRUMENT, amdAccountId);
  if (!pricing.length) {
    logError('[AmdDistribution] getPricing returned empty');
    return null;
  }
  const askPrice = parseFloat(pricing[0].ask);
  const bidPrice = parseFloat(pricing[0].bid);
  const entryPrice = direction === 'long' ? askPrice : bidPrice;
  const slDistance = HARD_SL_PIPS * 0.0001;
  const hardSlPrice =
    direction === 'long' ? entryPrice - slDistance : entryPrice + slDistance;
  const units = calculateUnits({
    equity: account.equity,
    engineWeight: weight,
    riskPct: BASELINE_RISK_PCT,
    entry: entryPrice,
    stopLoss: hardSlPrice,
    instrument: INSTRUMENT,
    consecutiveLosses: 0,
    graduatedThreshold: 999,
    confluenceScore: 75,
    slPipsOverride: HARD_SL_PIPS,
  });
  return {
    entryPrice,
    hardSlPrice,
    signedUnits: direction === 'long' ? units : -units,
    exitStrategy: 'S0',
    equity: account.equity,
    weight,
  };
}

async function submitAmdOrder(
  tag: string,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  plan: OrderPlan,
  todayStr: string,
): Promise<void> {
  const amdAccountId = resolveAmdOandaAccountId();
  const exitStrategy = tag === 'AMD_NONE' ? 'S1' : plan.exitStrategy;
  logInfo('[AmdDistribution] Placing order', {
    tag,
    direction,
    entryPrice: plan.entryPrice,
    hardSlPrice: plan.hardSlPrice,
    units: plan.signedUnits,
    exitStrategy,
  });
  const orderResult = await placeMarketOrder(
    {
      instrument: INSTRUMENT,
      units: plan.signedUnits,
      stopLossPrice: plan.hardSlPrice.toFixed(5),
    },
    10_000,
    amdAccountId,
  );
  const { tradeId, fillPrice: oandaFill } = parseFillFromOrder(orderResult);
  if (!tradeId) {
    logError('[AmdDistribution] OANDA order failed — no tradeId', { orderResult });
    await writeBlockedLog(
      'OANDA_ERROR: no tradeId',
      tag,
      amdRow,
      plan.hardSlPrice,
      direction.toUpperCase(),
    );
    return;
  }
  const fillPrice = oandaFill ?? plan.entryPrice;
  logInfo('[AmdDistribution] Order filled', { tradeId, fillPrice, tag, direction });
  await persistOpenTrade(
    tag,
    direction,
    amdRow,
    fillPrice,
    plan.hardSlPrice,
    plan.signedUnits,
    tradeId,
    exitStrategy,
    plan.equity,
    plan.weight,
  );
  void sendTradeExecutedAlert({
    oandaInstrument: INSTRUMENT,
    direction: direction.toUpperCase(),
    fillPrice,
    stopLoss: plan.hardSlPrice,
    takeProfit: null,
    filledUnits: Math.abs(plan.signedUnits),
    amdTag: tag,
    amdSizeMultiplier: plan.weight,
    directionSource: 'auto',
    engineId: ENGINE_ID,
  }).catch(() => {});
  await persistTrailState(tag, direction, fillPrice, plan.hardSlPrice, tradeId, exitStrategy, todayStr);
  try {
    const now = new Date();
    const preFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const preTo = now.toISOString();
    const h1From = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const [preM5, preH1] = await Promise.all([
      fetchCandleRange(INSTRUMENT, preFrom, preTo, 'M5'),
      fetchCandleRange(INSTRUMENT, h1From, preTo, 'H1'),
    ]);
    await supabaseDb()
      .from('bridge_trade_log')
      .update({
        pre_entry_candles: preM5,
        h1_session_candles: preH1,
      })
      .eq('oanda_trade_id', tradeId)
      .eq('engine_id', ENGINE_ID);
  } catch {
    // non-fatal — candle capture never blocks trade logging
  }
}

async function runExecution(
  tag: string,
  direction: TradeDirection,
  amdRow: AmdStateRow,
  weight: number,
  todayStr: string,
): Promise<void> {
  const plan = await buildOrderPlan(direction, weight);
  if (!plan) return;
  await submitAmdOrder(tag, direction, amdRow, plan, todayStr);
}

async function passesExecutionGates(
  tag: string,
  amdRow: AmdStateRow,
  todayStr: string,
  hourUtc: number,
  minUtc: number,
): Promise<{ ok: true; direction: TradeDirection; weight: number } | { ok: false }> {
  const autoDirection = (amdRow.decision_auto_direction ?? amdRow.auto_direction) as string | null;
  if (autoDirection !== 'long' && autoDirection !== 'short') {
    logInfo('[AmdDistribution] auto_direction neutral — no trade today', { autoDirection });
    return { ok: false };
  }
  if (await loadAmdAsianCloseFilterEnabled(supabaseDb())) {
    const biasSignal = amdRow.asian_close_bias_signal as string | null;
    if (biasSignal !== null && biasSignal !== 'NEUTRAL') {
      const biasDirection = biasSignal === 'BULLISH' ? 'long' : 'short';
      if (biasDirection !== autoDirection) {
        const biasPct = amdRow.asian_close_position_pct as number | null;
        const blockReason =
          `ASIAN_CLOSE_DISAGREE: auto=${autoDirection} bias=${biasSignal} pct=${biasPct ?? 'null'}`;
        const alreadyBlocked = await hasBlockedToday(todayStr, blockReason);
        if (!alreadyBlocked) {
          logInfo(`[AmdDistribution] BLOCKED ${blockReason}`);
          await writeBlockedLog(blockReason, tag, amdRow, 0.635, autoDirection.toUpperCase());
        }
        return { ok: false };
      }
    }
  }
  if (!isEntryWindowOpen(tag, hourUtc, minUtc)) return { ok: false };
  const evaluatedAt = new Date(amdRow.evaluated_at as string);
  if (evaluatedAt.toISOString().slice(0, 10) !== todayStr) {
    logInfo('[AmdDistribution] amd_state not evaluated today — skipping');
    return { ok: false };
  }
  if (await hasExecutedToday(todayStr)) {
    logInfo('[AmdDistribution] Already traded today — skipping');
    return { ok: false };
  }
  const engineRow = await loadEngineRow();
  if (!engineRow?.is_active) {
    logInfo('[AmdDistribution] engine_amd is_active=false — BLOCKED');
    await writeBlockedLog('ENGINE_INACTIVE', tag, amdRow, 0.635, autoDirection.toUpperCase());
    return { ok: false };
  }
  if (await isNewsBlackout()) {
    logInfo('[AmdDistribution] News blackout window — BLOCKED');
    await writeBlockedLog('NEWS_WINDOW', tag, amdRow, 0.635, autoDirection.toUpperCase());
    return { ok: false };
  }
  return { ok: true, direction: autoDirection, weight: engineRow.weight };
}

export class AmdDistributionEngine {
  static async checkAndExecute(): Promise<void> {
    if (!isEnabled()) return;
    const { todayStr, hourUtc, minUtc } = utcNowParts();
    const amdRow = await loadTodayAmdState(todayStr);
    if (!amdRow) {
      logInfo('[AmdDistribution] No amd_state for today — skipping', { todayStr });
      return;
    }
    const tag = effectiveTag(amdRow);
    if (!tag || !(tag in TAG_ENTRY_HOUR)) {
      logInfo('[AmdDistribution] Tag not tradeable', { tag });
      return;
    }
    const gate = await passesExecutionGates(tag, amdRow, todayStr, hourUtc, minUtc);
    if (!gate.ok) return;
    try {
      await runExecution(tag, gate.direction, amdRow, gate.weight, todayStr);
    } catch (execErr) {
      logError('[AmdDistribution] Execution error', { err: String(execErr) });
    }
  }
}
