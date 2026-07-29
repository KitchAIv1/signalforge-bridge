/**
 * PDL Window multi-broker entry — LONG or SHORT, SL 5p, no TP.
 * OANDA: blocked if Fade has open AUD_USD. MT5: no Fade gate.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { sendTradeExecutedAlert } from '../telegram/alertTradeExecution.js';
import { loadExecutionRoutes, type EngineBrokerRoute } from '../broker/brokerLinkService.js';
import { loadTodayPdlWindowSignal } from './pdlWindowConditions.js';
import {
  PDL_WINDOW_ENGINE_ID,
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
import { hardSlPrice } from './pdlWindowPnl.js';
import {
  calculatePdlWindowUnits,
  loadPdlWindowEngineWeight,
} from './pdlWindowSizer.js';
import type {
  PdlWindowConditionsMet,
  PdlWindowDirection,
} from './pdlWindowTypes.js';

function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
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

async function resolveEntryEstimate(route: EngineBrokerRoute): Promise<number> {
  try {
    const candle = await route.broker.fetchLatestM5Candle(
      route.broker.toBrokerInstrument(PDL_WINDOW_PAIR),
    );
    return candle?.close ?? 0;
  } catch (err) {
    console.error('[PdlWindow] fetchLatestM5Candle failed', {
      brokerId: route.brokerId,
      err: String(err),
    });
    return 0;
  }
}

async function openPdlOnBroker(
  tradeDate: string,
  route: EngineBrokerRoute,
  conditions: PdlWindowConditionsMet,
  direction: PdlWindowDirection,
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

  const entryEstimate = await resolveEntryEstimate(route);
  if (!(entryEstimate > 0)) return;

  const slEstimate = hardSlPrice(entryEstimate, direction);
  const unitsAbs = calculatePdlWindowUnits(equity, weight, entryEstimate, slEstimate);
  if (unitsAbs <= 0) return;
  const signedUnits = direction === 'long' ? unitsAbs : -unitsAbs;

  let orderResult;
  try {
    orderResult = await broker.placeMarketOrder({
      instrument: PDL_WINDOW_PAIR,
      units: signedUnits,
      stopLossPrice: slEstimate.toFixed(5),
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

  const fillSl = hardSlPrice(fillPrice, direction);
  await insertPdlTrade({
    trade_date: tradeDate,
    broker_id: brokerId,
    oanda_trade_id: tradeId,
    units: signedUnits,
    direction,
    entry_price: fillPrice,
    sl_price: fillSl,
    conditions_met: conditions,
    opened_at: new Date().toISOString(),
  });

  void sendTradeExecutedAlert({
    oandaInstrument: broker.toBrokerInstrument(PDL_WINDOW_PAIR),
    direction: direction === 'long' ? 'LONG' : 'SHORT',
    fillPrice,
    stopLoss: fillSl,
    takeProfit: null,
    filledUnits: signedUnits,
    amdTag: null,
    amdSizeMultiplier: weight,
    directionSource: `pdl_window:${brokerId}`,
    engineId: PDL_WINDOW_ENGINE_ID,
  }).catch(() => {});

  console.log('[PdlWindow] opened', { direction, brokerId, units: signedUnits, tradeId, fillPrice });
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

  const weight = await loadPdlWindowEngineWeight();
  const routes = await loadExecutionRoutes(getSupabaseClient(), PDL_WINDOW_ENGINE_ID);

  for (const route of routes) {
    const block = await entryGuardsBlock(tradeDate, route.brokerId);
    if (block) {
      console.log(`[PdlWindow] BLOCKED ${block}`, { brokerId: route.brokerId });
      continue;
    }
    await openPdlOnBroker(
      tradeDate,
      route,
      signal.conditions,
      signal.direction,
      weight,
    );
  }
}
