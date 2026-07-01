/**
 * AUDUSD Fade — multi-broker entry and exit orchestration.
 */

import type { BrokerClient } from '../../connectors/broker/types.js';
import { fetchCompletedCandles, getAccountSummary } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { sendTradeExecutedAlert } from '../telegram/alertTradeExecution.js';
import {
  countTradesToday,
  insertTrade,
  loadOpenTrades,
  recentTradeOpened,
} from './fadeDayState.js';
import { fadeError, fadeLog, fadeWarn } from './fadeLogger.js';
import { evaluateSetup, type FadeSetup } from './fadeStrategy.js';
import type { FadeConfig } from './fadeTypes.js';
import { loadFadeConfig, todayUtcString } from './fadeTypes.js';
import { loadExecutionRoutes, type EngineBrokerRoute } from '../broker/brokerLinkService.js';

const ENGINE_ID = 'audusd_fade';
const CANDLE_LOOKBACK_MS = 16 * 60 * 60 * 1000;

function calculateFadeUnits(equity: number, riskPct: number, stopPips: number): number {
  const pipValue = 0.0001;
  const riskAmount = equity * (riskPct / 100);
  return Math.round(riskAmount / (stopPips * pipValue) / 1000) * 1000;
}

async function fetchClosesFromBroker(
  broker: BrokerClient,
  pair: string,
): Promise<number[]> {
  const toISO = new Date().toISOString();
  const fromISO = new Date(Date.now() - CANDLE_LOOKBACK_MS).toISOString();
  const instrument = broker.toBrokerInstrument(pair);
  const candles = await broker.fetchCompletedCandles(instrument, 'M5', fromISO, toISO);
  return candles.map((candle) => parseFloat(candle.mid.c)).filter(Number.isFinite);
}

async function fetchClosesOanda(pair: string): Promise<number[]> {
  const toISO = new Date().toISOString();
  const fromISO = new Date(Date.now() - CANDLE_LOOKBACK_MS).toISOString();
  const candles = await fetchCompletedCandles(pair, 'M5', fromISO, toISO);
  return candles.map((candle) => parseFloat(candle.mid.c)).filter(Number.isFinite);
}

async function resolveSetup(cfg: FadeConfig, candleBroker: BrokerClient): Promise<FadeSetup | null> {
  const useOandaCandles = candleBroker.brokerType === 'oanda';
  const audCloses = useOandaCandles
    ? await fetchClosesOanda(cfg.pair)
    : await fetchClosesFromBroker(candleBroker, cfg.pair);
  const eurCloses = useOandaCandles
    ? await fetchClosesOanda(cfg.gatePair)
    : await fetchClosesFromBroker(candleBroker, cfg.gatePair);
  if (audCloses.length < cfg.smaPeriod || eurCloses.length <= cfg.gateWindowBars) {
    fadeWarn('Insufficient candles for evaluation', {
      aud: audCloses.length,
      eur: eurCloses.length,
      brokerId: candleBroker.brokerId,
    });
    return null;
  }
  return evaluateSetup(audCloses, eurCloses, cfg);
}

async function entryGuardsBlock(
  cfg: FadeConfig,
  tradeDate: string,
  brokerId: string,
): Promise<boolean> {
  const openTrades = await loadOpenTrades(tradeDate, cfg.pair, brokerId);
  if (openTrades.length > 0) return true;
  if ((await countTradesToday(tradeDate, cfg.pair, brokerId)) >= cfg.maxTradesDay) return true;
  if (await recentTradeOpened(tradeDate, cfg.pair, brokerId)) return true;
  return false;
}

async function openFadeOnBroker(
  cfg: FadeConfig,
  setup: FadeSetup,
  tradeDate: string,
  route: EngineBrokerRoute,
): Promise<void> {
  const { broker, brokerId } = route;
  let equity = 25_000;
  try {
    const summary = await broker.getAccountSummary();
    equity = summary.equity;
  } catch (err) {
    fadeError('getAccountSummary failed for fade route', { brokerId, error: String(err) });
    return;
  }

  const units = calculateFadeUnits(equity, cfg.riskPct, cfg.stopPips);
  if (units <= 0) return;
  const signedUnits = setup.fade === 'long' ? units : -units;
  const instrument = broker.toBrokerInstrument(cfg.pair);

  let orderResult;
  try {
    orderResult = await broker.placeMarketOrder({
      instrument: cfg.pair,
      units: signedUnits,
      takeProfitPrice: setup.tp.toFixed(5),
      stopLossPrice: setup.sl.toFixed(5),
    });
  } catch (err) {
    fadeError('placeMarketOrder failed', { brokerId, error: String(err) });
    return;
  }

  const fillTx = orderResult.orderFillTransaction;
  if (orderResult.orderCancelTransaction || !fillTx) {
    fadeWarn('Order cancelled', {
      brokerId,
      reason: orderResult.orderCancelTransaction?.reason,
    });
    return;
  }

  const tradeId = fillTx.tradeOpened?.tradeID ?? fillTx.id ?? null;
  const fillPrice = fillTx.price != null ? Number(fillTx.price) : null;
  if (!fillPrice || !tradeId) return;

  await insertTrade({
    trade_date: tradeDate,
    pair: cfg.pair,
    broker_id: brokerId,
    oanda_trade_id: tradeId,
    units,
    direction: setup.fade,
    entry_price: fillPrice,
    tp_price: setup.tp,
    sl_price: setup.sl,
    ext_pips: setup.extPips,
    aligned_eur: setup.aligned,
    opened_at: new Date().toISOString(),
  });

  void sendTradeExecutedAlert({
    oandaInstrument: instrument,
    direction: setup.fade.toUpperCase(),
    fillPrice,
    stopLoss: setup.sl,
    takeProfit: setup.tp,
    filledUnits: units,
    amdTag: null,
    amdSizeMultiplier: null,
    directionSource: `audusd_fade:${brokerId}`,
    engineId: ENGINE_ID,
  }).catch(() => {});

  fadeLog('Fade trade opened', { brokerId, fade: setup.fade, units, tradeId });
}

export async function runFadeEntryForAllBrokers(cfg: FadeConfig): Promise<void> {
  const tradeDate = todayUtcString();
  const routes = await loadExecutionRoutes(getSupabaseClient(), ENGINE_ID);
  const candleBroker = routes.find((r) => r.broker.brokerType === 'oanda')?.broker ?? routes[0]!.broker;

  for (const route of routes) {
    if (await entryGuardsBlock(cfg, tradeDate, route.brokerId)) continue;
    const setup = await resolveSetup(cfg, candleBroker);
    if (!setup) continue;
    await openFadeOnBroker(cfg, setup, tradeDate, route);
  }
}
