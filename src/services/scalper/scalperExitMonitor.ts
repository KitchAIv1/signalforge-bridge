/**
 * Exit monitor — polls each open DB trade via OANDA getTradeById().
 * Infers win/loss from averageClosePrice vs DB sl_price (win = better than SL).
 * On SL: circuit breaker force-closes all other open positions (flat accounting).
 * Recovery: if day_stopped, retries any force_flat_failed trades.
 *
 * IRON LAW 3: SL hit = ALL positions closed immediately, day stops
 * IRON LAW 4: ratchet_count never exceeds SCALPER_MAX_RATCHETS
 * IRON LAW 5: reference_price never moves backward (against direction)
 *
 * Ratchet fires on OANDA close confirmation, not price touch.
 * Deviation from backtest negligible (<1 bar in live execution).
 */

import { closeTrade, getTradeById } from '../../connectors/oanda.js';
import { syncScalperTradeToBridgeLog } from './scalperBridgeSync.js';
import { sendTradeClosedAlert } from '../telegram/alertTradeClose.js';
import {
  loadFailedForceFlatTrades,
  loadOpenTrades,
  loadTodayDayState,
  refreshDayNetPips,
  stopDay,
  updateTrade,
  upsertDayState,
} from './scalperDayState.js';
import { scalperError, scalperLog, scalperWarn } from './scalperLogger.js';
import type { ScalperConfig, ScalperDirection, ScalperTrade } from './scalperTypes.js';
import type { ScalperTradeResult } from './scalperTypes.js';
import { pipsToPrice, signedPips, todayUtcString } from './scalperTypes.js';

function inferResult(
  averageClosePrice: number,
  trade: ScalperTrade,
  direction: ScalperDirection,
): 'win' | 'loss' {
  return direction === 'long'
    ? averageClosePrice > trade.sl_price ? 'win' : 'loss'
    : averageClosePrice < trade.sl_price ? 'win' : 'loss';
}

function inferCloseReason(
  averageClosePrice: number,
  trade: ScalperTrade,
  direction: ScalperDirection,
): string {
  const atSl = direction === 'long'
    ? averageClosePrice <= trade.sl_price
    : averageClosePrice >= trade.sl_price;
  if (atSl) return 'sl_hit';

  const atTp = direction === 'long'
    ? averageClosePrice >= trade.tp_price
    : averageClosePrice <= trade.tp_price;
  if (atTp) return 'tp_hit';

  return 'external_close';
}

function computeScalperPnlDollars(trade: ScalperTrade, pnlPips: number): number {
  const pipDollarValue = (trade.units ?? 0) * 0.0001;
  return Math.round(pnlPips * pipDollarValue * 100) / 100;
}

async function syncClosedTrade(
  trade: ScalperTrade,
  fields: {
    result: ScalperTradeResult;
    exit_price?: number;
    pnl_pips?: number;
    pnl_pips_actual?: number;
    closed_at?: string;
    close_reason?: string;
  },
  tradeDate: string,
  pair: string,
): Promise<void> {
  const dayState = await loadTodayDayState(tradeDate, pair);
  if (!dayState) return;
  await syncScalperTradeToBridgeLog({ ...trade, ...fields }, dayState);
  const effectivePips = fields.pnl_pips_actual ?? fields.pnl_pips ?? 0;
  void sendTradeClosedAlert({
    engineId: 'scalper',
    instrument: pair,
    direction: trade.direction,
    entryPrice: trade.entry_price,
    exitPrice: fields.exit_price ?? trade.entry_price,
    pnlPips: effectivePips,
    pnlDollars: computeScalperPnlDollars(trade, effectivePips),
    closeReason: fields.close_reason ?? 'unknown',
    durationMinutes: Math.floor(
      (Date.now() - new Date(trade.opened_at ?? trade.created_at).getTime()) / 60000,
    ),
  }).catch(() => {});
}

async function forceCloseOne(
  trade: ScalperTrade,
  tradeDate: string,
  pair: string,
): Promise<void> {
  try {
    const closeResult = await closeTrade(trade.oanda_trade_id!);
    const fillPrice = closeResult.orderFillTransaction?.price != null
      ? Number(closeResult.orderFillTransaction.price)
      : trade.entry_price;
    const pnlActual = signedPips(trade.entry_price, fillPrice, trade.direction as ScalperDirection);
    const closeFields = {
      result: 'force_flat' as const,
      exit_price: fillPrice,
      pnl_pips: 0,
      pnl_pips_actual: pnlActual,
      closed_at: new Date().toISOString(),
      close_reason: 'circuit_breaker',
    };
    await updateTrade(trade.id, closeFields, tradeDate);
    await syncClosedTrade(trade, closeFields, tradeDate, pair);
    scalperLog('Force-closed trade (circuit breaker)', {
      id: trade.id,
      oandaTradeId: trade.oanda_trade_id,
      pnlActual,
    });
  } catch (err) {
    scalperError('Force-close failed — marking force_flat_failed', {
      id: trade.id,
      oandaTradeId: trade.oanda_trade_id,
      error: String(err),
    });
    await updateTrade(
      trade.id,
      { result: 'force_flat_failed', close_reason: 'circuit_breaker_failed' },
      tradeDate,
    ).catch((dbErr) => scalperError('Could not mark force_flat_failed', { error: String(dbErr) }));
  }
}

async function retryFailedForceFlats(tradeDate: string, pair: string): Promise<void> {
  const failed = await loadFailedForceFlatTrades(tradeDate, pair);
  if (!failed.length) return;
  scalperWarn('Retrying force_flat_failed trades', { count: failed.length, tradeDate });
  for (const trade of failed) {
    if (!trade.oanda_trade_id) continue;
    await forceCloseOne(trade, tradeDate, pair);
  }
}

async function handleWin(
  trade: ScalperTrade,
  averageClosePrice: number,
  tradeDate: string,
  config: ScalperConfig,
): Promise<void> {
  const direction = trade.direction as ScalperDirection;
  const pnlActual = signedPips(trade.entry_price, averageClosePrice, direction);
  const closeFields = {
    result: 'win' as const,
    exit_price: averageClosePrice,
    pnl_pips: pnlActual ?? config.tpPips,
    pnl_pips_actual: pnlActual,
    closed_at: new Date().toISOString(),
    close_reason: inferCloseReason(averageClosePrice, trade, direction),
  };
  await updateTrade(trade.id, closeFields, tradeDate);
  await syncClosedTrade(trade, closeFields, tradeDate, config.pair);

  // IRON LAW 5: new reference can only move in direction of trade
  const newReference = trade.tp_price;
  const newTrigger = direction === 'long'
    ? newReference - pipsToPrice(config.pullbackPips)
    : newReference + pipsToPrice(config.pullbackPips);

  const dayState = await loadTodayDayState(tradeDate, config.pair);
  if (!dayState) return;

  const newRatchetCount = dayState.ratchet_count + 1;

  // IRON LAW 5 guard: reference must move in direction
  const referenceOk = direction === 'long'
    ? newReference > (dayState.reference_price ?? 0)
    : newReference < (dayState.reference_price ?? 999);
  if (!referenceOk) {
    scalperWarn('Ratchet skipped — reference would move backward', {
      existing: dayState.reference_price,
      proposed: newReference,
      direction,
    });
    return;
  }

  const willStop = newRatchetCount >= config.maxRatchets;
  await upsertDayState({
    trade_date: tradeDate,
    pair: config.pair,
    reference_price: newReference,
    trigger_level: newTrigger,
    ratchet_count: newRatchetCount,
    ...(willStop && { day_stopped: true, stop_reason: 'max_ratchets' }),
  });

  scalperLog('TP hit — ratchet', {
    ratchetCount: newRatchetCount,
    newReference: newReference.toFixed(5),
    newTrigger: newTrigger.toFixed(5),
    dayStopped: willStop,
    tradeDate,
  });
}

async function handleLoss(
  lossTrade: ScalperTrade,
  averageClosePrice: number,
  allOpenTrades: ScalperTrade[],
  tradeDate: string,
  config: ScalperConfig,
): Promise<void> {
  const direction = lossTrade.direction as ScalperDirection;
  const pnlActual = signedPips(lossTrade.entry_price, averageClosePrice, direction);
  const closeFields = {
    result: 'loss' as const,
    exit_price: averageClosePrice,
    pnl_pips: -config.slPips,
    pnl_pips_actual: pnlActual,
    closed_at: new Date().toISOString(),
    close_reason: inferCloseReason(averageClosePrice, lossTrade, direction),
  };
  await updateTrade(lossTrade.id, closeFields, tradeDate);
  await syncClosedTrade(lossTrade, closeFields, tradeDate, config.pair);

  // IRON LAW 3: circuit breaker — force-close every other open position
  const others = allOpenTrades.filter((t) => t.id !== lossTrade.id && t.oanda_trade_id);
  for (const other of others) {
    await forceCloseOne(other, tradeDate, config.pair);
  }

  await stopDay(tradeDate, 'sl', config.pair);

  scalperLog('SL hit — day stopped, circuit breaker fired', {
    lossTradeId: lossTrade.id,
    forceClosed: others.length,
    tradeDate,
  });
}

export async function runExitMonitor(config: ScalperConfig): Promise<void> {
  // Issue F fix: runtime guard
  if (process.env.SCALPER_ENABLED !== 'true') return;

  const tradeDate = todayUtcString();
  const dayState = await loadTodayDayState(tradeDate, config.pair);
  if (!dayState) return;

  // Recovery: retry any stuck force_flat_failed positions first
  if (dayState.day_stopped) {
    await retryFailedForceFlats(tradeDate, config.pair);
    return;
  }

  const openTrades = await loadOpenTrades(tradeDate, config.pair);
  if (!openTrades.length) return;

  const direction = dayState.direction as ScalperDirection | null;
  if (!direction) return;

  for (const trade of openTrades) {
    if (!trade.oanda_trade_id) continue;

    let details: Awaited<ReturnType<typeof getTradeById>>;
    try {
      details = await getTradeById(trade.oanda_trade_id);
    } catch (err) {
      scalperWarn('getTradeById threw — skipping this cycle', {
        oandaTradeId: trade.oanda_trade_id,
        error: String(err),
      });
      continue;
    }

    if (!details || details.state === 'OPEN') continue;

    if (details.averageClosePrice == null) {
      scalperWarn('Trade closed on OANDA but no averageClosePrice — skipping', {
        oandaTradeId: trade.oanda_trade_id,
      });
      continue;
    }

    const result = inferResult(details.averageClosePrice, trade, direction);

    if (result === 'loss') {
      await handleLoss(trade, details.averageClosePrice, openTrades, tradeDate, config);
      await refreshDayNetPips(tradeDate, config.pair);
      return; // day stopped — no further processing
    }

    await handleWin(trade, details.averageClosePrice, tradeDate, config);
  }
}
