/**
 * PDL Window multi-broker entry — LONG only, SL 20p, no TP.
 * OANDA: blocked if Fade has open AUD_USD. MT5: no Fade gate.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { sendTradeExecutedAlert } from '../telegram/alertTradeExecution.js';
import { loadExecutionRoutes, type EngineBrokerRoute } from '../broker/brokerLinkService.js';
import { loadTodayPdlWindowSignal } from './pdlWindowConditions.js';
import {
  PDL_WINDOW_ENGINE_ID,
  PDL_WINDOW_HARD_SL_PIPS,
  PDL_WINDOW_PAIR,
} from './pdlWindowConstants.js';
import {
  countPdlTradesToday,
  insertPdlTrade,
  loadOpenPdlTrades,
} from './pdlWindowDayState.js';
import {
  hasOpenFadeTradeOnOanda,
  isOandaBrokerId,
} from './pdlWindowFadeOandaGuard.js';
import { isPdlWindowPaused } from './pdlWindowPauseGuard.js';
import {
  calculatePdlWindowUnits,
  loadPdlWindowEngineWeight,
} from './pdlWindowSizer.js';
import type { PdlWindowConditionsMet } from './pdlWindowTypes.js';

function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

function hardSlPrice(entryPrice: number): number {
  return entryPrice - PDL_WINDOW_HARD_SL_PIPS * 0.0001;
}

async function entryGuardsBlock(tradeDate: string, brokerId: string): Promise<string | null> {
  const open = await loadOpenPdlTrades(tradeDate, PDL_WINDOW_PAIR, brokerId);
  if (open.length > 0) return 'ALREADY_OPEN';
  if ((await countPdlTradesToday(tradeDate, PDL_WINDOW_PAIR, brokerId)) >= 1) {
    return 'ALREADY_TRADED_TODAY';
  }
  if (isOandaBrokerId(brokerId) && (await hasOpenFadeTradeOnOanda())) {
    return 'FADE_OPEN_OANDA';
  }
  return null;
}

async function openPdlOnBroker(
  tradeDate: string,
  route: EngineBrokerRoute,
  conditions: PdlWindowConditionsMet,
  weight: number,
): Promise<void> {
  const { broker, brokerId } = route;
  let equity = 0;
  try {
    equity = (await broker.getAccountSummary()).equity;
  } catch (err) {
    console.error('[PdlWindow] getAccountSummary failed', { brokerId, err: String(err) });
    return;
  }

  let entryEstimate = 0;
  try {
    const candle = await broker.fetchLatestM5Candle(
      broker.toBrokerInstrument(PDL_WINDOW_PAIR),
    );
    entryEstimate = candle?.close ?? 0;
  } catch (err) {
    console.error('[PdlWindow] fetchLatestM5Candle failed', { brokerId, err: String(err) });
    return;
  }
  if (!(entryEstimate > 0)) return;

  const sl = hardSlPrice(entryEstimate);
  const units = calculatePdlWindowUnits(equity, weight, entryEstimate, sl);
  if (units <= 0) return;

  let orderResult;
  try {
    orderResult = await broker.placeMarketOrder({
      instrument: PDL_WINDOW_PAIR,
      units,
      stopLossPrice: sl.toFixed(5),
    });
  } catch (err) {
    console.error('[PdlWindow] placeMarketOrder failed', { brokerId, err: String(err) });
    return;
  }

  const fillTx = orderResult.orderFillTransaction;
  if (orderResult.orderCancelTransaction || !fillTx) {
    console.warn('[PdlWindow] order cancelled', {
      brokerId,
      reason: orderResult.orderCancelTransaction?.reason,
    });
    return;
  }

  const tradeId = fillTx.tradeOpened?.tradeID ?? fillTx.id ?? null;
  const fillPrice = fillTx.price != null ? Number(fillTx.price) : null;
  if (!fillPrice || !tradeId) return;

  const fillSl = hardSlPrice(fillPrice);
  await insertPdlTrade({
    trade_date: tradeDate,
    broker_id: brokerId,
    oanda_trade_id: tradeId,
    units,
    direction: 'long',
    entry_price: fillPrice,
    sl_price: fillSl,
    conditions_met: conditions,
    opened_at: new Date().toISOString(),
  });

  void sendTradeExecutedAlert({
    oandaInstrument: broker.toBrokerInstrument(PDL_WINDOW_PAIR),
    direction: 'LONG',
    fillPrice,
    stopLoss: fillSl,
    takeProfit: null,
    filledUnits: units,
    amdTag: null,
    amdSizeMultiplier: weight,
    directionSource: `pdl_window:${brokerId}`,
    engineId: PDL_WINDOW_ENGINE_ID,
  }).catch(() => {});

  console.log('[PdlWindow] opened LONG', { brokerId, units, tradeId, fillPrice });
}

export async function runPdlWindowEntryForAllBrokers(): Promise<void> {
  if (await isPdlWindowPaused()) {
    console.log('[PdlWindow] paused_engines — skip entry');
    return;
  }

  const tradeDate = todayUtcString();
  const signal = await loadTodayPdlWindowSignal(tradeDate);
  if (!signal) {
    console.warn('[PdlWindow] no pdl_sweep_signals row yet — skip entry');
    return;
  }
  if (!signal.shouldTrade) {
    console.log('[PdlWindow] all-3-false — NO TRADE today');
    return;
  }

  const weight = await loadPdlWindowEngineWeight();
  const routes = await loadExecutionRoutes(getSupabaseClient(), PDL_WINDOW_ENGINE_ID);

  for (const route of routes) {
    const block = await entryGuardsBlock(tradeDate, route.brokerId);
    if (block) {
      console.log(`[PdlWindow] BLOCKED ${block}`, { brokerId: route.brokerId });
      continue;
    }
    await openPdlOnBroker(tradeDate, route, signal.conditions, weight);
  }
}
