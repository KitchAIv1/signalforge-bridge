/**
 * Entry monitor — every tick: fetch completed AUD/EUR M5, evaluate the EURUSD-gated
 * SMA50 fade setup, and place one bracketed OANDA practice market order when it fires.
 *
 * Guards: one open fade trade at a time, max trades/day cap, one-trade-per-M5-bar,
 * and units always sized from live account equity.
 */

import {
  fetchCompletedCandles,
  getAccountSummary,
  placeMarketOrder,
} from '../../connectors/oanda.js';
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
import { todayUtcString } from './fadeTypes.js';

const CANDLE_LOOKBACK_MS = 16 * 60 * 60 * 1000; // ~192 M5 bars; covers SMA50 + 48-bar gate.

/** AUD_USD / EUR_USD quote currency is USD, pipValue = 0.0001 per unit. */
function calculateFadeUnits(equity: number, riskPct: number, stopPips: number): number {
  const pipValue = 0.0001;
  const riskAmount = equity * (riskPct / 100);
  return Math.round(riskAmount / (stopPips * pipValue) / 1000) * 1000;
}

async function fetchCloses(pair: string): Promise<number[]> {
  const toISO = new Date().toISOString();
  const fromISO = new Date(Date.now() - CANDLE_LOOKBACK_MS).toISOString();
  const candles = await fetchCompletedCandles(pair, 'M5', fromISO, toISO);
  return candles.map((candle) => parseFloat(candle.mid.c)).filter(Number.isFinite);
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

async function entryGuardsBlock(cfg: FadeConfig, tradeDate: string): Promise<boolean> {
  const openTrades = await loadOpenTrades(tradeDate, cfg.pair);
  if (openTrades.length > 0) return true; // one-trade-at-a-time
  if ((await countTradesToday(tradeDate, cfg.pair)) >= cfg.maxTradesDay) return true;
  if (await recentTradeOpened(tradeDate, cfg.pair)) return true; // one-per-bar
  return false;
}

async function resolveSetup(cfg: FadeConfig): Promise<FadeSetup | null> {
  const [audCloses, eurCloses] = await Promise.all([
    fetchCloses(cfg.pair),
    fetchCloses(cfg.gatePair),
  ]);
  if (audCloses.length < cfg.smaPeriod || eurCloses.length <= cfg.gateWindowBars) {
    fadeWarn('Insufficient candles for evaluation', {
      aud: audCloses.length,
      eur: eurCloses.length,
    });
    return null;
  }
  return evaluateSetup(audCloses, eurCloses, cfg);
}

async function openFadeTrade(
  cfg: FadeConfig,
  setup: FadeSetup,
  tradeDate: string,
): Promise<void> {
  const { equity } = await getAccountSummary();
  const units = calculateFadeUnits(equity, cfg.riskPct, cfg.stopPips);
  if (units <= 0) {
    fadeError('Calculated zero units — skipping entry', { equity, riskPct: cfg.riskPct });
    return;
  }
  const signedUnits = setup.fade === 'long' ? units : -units;

  let orderResult: Awaited<ReturnType<typeof placeMarketOrder>>;
  try {
    orderResult = await placeMarketOrder({
      instrument: cfg.pair,
      units: signedUnits,
      takeProfitPrice: setup.tp.toFixed(5),
      stopLossPrice: setup.sl.toFixed(5),
    });
  } catch (err) {
    fadeError('placeMarketOrder failed', { error: String(err), tradeDate });
    return;
  }
  if (orderResult.orderCancelTransaction) {
    fadeWarn('Order cancelled by OANDA', {
      reason: orderResult.orderCancelTransaction.reason,
      tradeDate,
    });
    return;
  }

  const { tradeId, fillPrice } = parseFill(orderResult);
  if (!fillPrice || !tradeId) {
    fadeError('No fill price in OANDA response', { orderResult: JSON.stringify(orderResult) });
    return;
  }

  await insertTrade({
    trade_date: tradeDate,
    pair: cfg.pair,
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
    oandaInstrument: cfg.pair,
    direction: setup.fade.toUpperCase(),
    fillPrice,
    stopLoss: setup.sl,
    takeProfit: setup.tp,
    filledUnits: units,
    amdTag: null,
    amdSizeMultiplier: null,
    directionSource: 'audusd_fade',
    engineId: 'audusd_fade',
  }).catch(() => {});

  fadeLog('Fade trade opened', {
    fade: setup.fade,
    entry: fillPrice,
    tp: setup.tp.toFixed(5),
    sl: setup.sl.toFixed(5),
    extPips: setup.extPips,
    alignedEur: setup.aligned,
    units,
    oandaTradeId: tradeId,
    tradeDate,
  });
}

export async function runEntryMonitor(cfg: FadeConfig): Promise<void> {
  if (process.env.AUDUSD_FADE_ENABLED !== 'true') return;

  const tradeDate = todayUtcString();
  if (await entryGuardsBlock(cfg, tradeDate)) return;

  const setup = await resolveSetup(cfg);
  if (!setup) return;

  await openFadeTrade(cfg, setup, tradeDate);
}
