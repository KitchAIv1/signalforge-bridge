/**
 * Entry monitor — checks trigger level every 30 s, fires one OANDA market order
 * when mid price touches the current trigger level.
 *
 * IRON LAW 1: Never open a trade if day_stopped=true
 * IRON LAW 2: Never open more than one trade per M5 bar (5-min guard)
 * IRON LAW 4: ratchet_count never exceeds SCALPER_MAX_RATCHETS
 * IRON LAW 8: Units always calculated from live account balance
 */

import { getAccountSummary, getPricing, placeMarketOrder } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { insertTrade, loadTodayDayState, recentTradeOpened } from './scalperDayState.js';
import { scalperError, scalperLog, scalperWarn } from './scalperLogger.js';
import type { ScalperConfig } from './scalperTypes.js';
import { pipsToPrice, todayUtcString } from './scalperTypes.js';

/** AUD_USD: quote currency is USD, pipValue = 0.0001 per unit. */
function calculateScalperUnits(balance: number, riskPct: number, slPips: number): number {
  const pipValue = 0.0001;
  const riskAmount = balance * riskPct;
  return Math.round(riskAmount / (slPips * pipValue) / 1000) * 1000;
}

function isTriggerWindow(): boolean {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const afterOpen = h > 10 || (h === 10 && m >= 5);
  const beforeCutoff = h < 15 || (h === 15 && m <= 55);
  return afterOpen && beforeCutoff;
}

async function isNewsBlackout(pair: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const { count } = await getSupabaseClient()
    .from('news_events')
    .select('id', { count: 'exact', head: true })
    .contains('affected_pairs', [pair])
    .gte('event_datetime_utc', windowStart)
    .lte('event_datetime_utc', windowEnd);
  return (count ?? 0) > 0;
}

function parseFill(orderResult: Awaited<ReturnType<typeof placeMarketOrder>>): {
  tradeId: string | null;
  fillPrice: number | null;
} {
  const fillTx = orderResult.orderFillTransaction;
  const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id ?? null;
  const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
  return { tradeId, fillPrice };
}

export async function runEntryMonitor(config: ScalperConfig): Promise<void> {
  // Issue F fix: runtime guard
  if (process.env.SCALPER_ENABLED !== 'true') return;

  const tradeDate = todayUtcString();
  const dayState = await loadTodayDayState(tradeDate, config.pair);

  // IRON LAW 1
  if (!dayState || dayState.day_stopped) return;
  if (!dayState.direction || dayState.reference_price == null || dayState.trigger_level == null) return;

  if (!isTriggerWindow()) return;

  // IRON LAW 4
  if (dayState.ratchet_count >= config.maxRatchets) return;

  // IRON LAW 2: 5-min bar guard
  if (await recentTradeOpened(tradeDate, config.pair)) return;

  const prices = await getPricing(config.pair);
  const quote = prices[0];
  if (!quote) {
    scalperWarn('No pricing returned for pair', { pair: config.pair });
    return;
  }
  const mid = (parseFloat(quote.bid) + parseFloat(quote.ask)) / 2;

  const triggered =
    dayState.direction === 'long'
      ? mid <= dayState.trigger_level
      : mid >= dayState.trigger_level;
  if (!triggered) return;

  if (await isNewsBlackout(config.pair)) {
    scalperWarn('News blackout — trigger suppressed', { pair: config.pair, tradeDate });
    return;
  }

  const { balance } = await getAccountSummary();
  const units = calculateScalperUnits(balance, config.riskPct, config.slPips);
  if (units <= 0) {
    scalperError('Calculated zero units — skipping entry', { balance, riskPct: config.riskPct });
    return;
  }

  const triggerLevel = dayState.trigger_level;
  const tpPrice = triggerLevel + (dayState.direction === 'long' ? 1 : -1) * pipsToPrice(config.tpPips);
  const slPrice = triggerLevel - (dayState.direction === 'long' ? 1 : -1) * pipsToPrice(config.slPips);
  const signedUnits = dayState.direction === 'long' ? units : -units;

  let orderResult: Awaited<ReturnType<typeof placeMarketOrder>>;
  try {
    orderResult = await placeMarketOrder({
      instrument: config.pair,
      units: signedUnits,
      takeProfitPrice: tpPrice.toFixed(5),
      stopLossPrice: slPrice.toFixed(5),
    });
  } catch (err) {
    scalperError('placeMarketOrder failed', { error: String(err), tradeDate });
    return;
  }

  if (orderResult.orderCancelTransaction) {
    scalperWarn('Order cancelled by OANDA', {
      reason: orderResult.orderCancelTransaction.reason,
      tradeDate,
    });
    return;
  }

  const { tradeId, fillPrice } = parseFill(orderResult);
  if (!fillPrice || !tradeId) {
    scalperError('No fill price in OANDA response', { orderResult: JSON.stringify(orderResult) });
    return;
  }

  await insertTrade({
    trade_date: tradeDate,
    pair: config.pair,
    oanda_trade_id: tradeId,
    direction: dayState.direction,
    entry_price: fillPrice,
    // tp_price and sl_price match what was sent to OANDA (trigger_level ± pips)
    tp_price: tpPrice,
    sl_price: slPrice,
    ratchet_index: dayState.ratchet_count + 1,
    opened_at: new Date().toISOString(),
  });

  scalperLog('Trade opened', {
    ratchetIndex: dayState.ratchet_count + 1,
    direction: dayState.direction,
    entry: fillPrice,
    tp: tpPrice.toFixed(5),
    sl: slPrice.toFixed(5),
    units,
    oandaTradeId: tradeId,
    tradeDate,
  });
}
