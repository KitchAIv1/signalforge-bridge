/**
 * AUDUSD Fade — multi-broker exit monitor.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { syncFadeTradeToBridgeLog } from './fadeBridgeSync.js';
import { resolveBrokerForFadeTrade } from './fadeBrokerResolver.js';
import { loadOpenTrades, updateTrade } from './fadeDayState.js';
import { fadeError, fadeLog, fadeWarn } from './fadeLogger.js';
import type { FadeConfig, FadeDirection, FadeTrade, FadeTradeResult } from './fadeTypes.js';
import { signedPips, todayUtcString } from './fadeTypes.js';
import { sendTradeClosedAlert } from '../telegram/alertTradeClose.js';
import type { BrokerClient } from '../../connectors/broker/types.js';

function inferCloseReason(close: number, trade: FadeTrade): string {
  const dir = trade.direction as FadeDirection;
  const atSl = dir === 'long' ? close <= trade.sl_price : close >= trade.sl_price;
  if (atSl) return 'sl_hit';
  const atTp = dir === 'long' ? close >= trade.tp_price : close <= trade.tp_price;
  if (atTp) return 'tp_hit';
  return 'external_close';
}

function computePnlDollars(trade: FadeTrade, pnlPips: number): number {
  const pipDollarValue = (trade.units ?? 0) * 0.0001;
  return Math.round(pnlPips * pipDollarValue * 100) / 100;
}

async function persistClose(
  trade: FadeTrade,
  fields: {
    result: FadeTradeResult;
    exit_price: number;
    pnl_pips: number;
    pnl_pips_actual: number;
    closed_at: string;
    close_reason: string;
  },
  pair: string,
): Promise<void> {
  await updateTrade(trade.id, fields);
  await syncFadeTradeToBridgeLog({ ...trade, ...fields });
  void sendTradeClosedAlert({
    engineId: 'audusd_fade',
    instrument: pair,
    direction: trade.direction,
    entryPrice: trade.entry_price,
    exitPrice: fields.exit_price,
    pnlPips: fields.pnl_pips_actual,
    pnlDollars: computePnlDollars(trade, fields.pnl_pips_actual),
    closeReason: fields.close_reason,
    durationMinutes: Math.floor(
      (Date.now() - new Date(trade.opened_at ?? trade.created_at).getTime()) / 60000,
    ),
  }).catch(() => {});
}

async function handleBrokerClosure(
  trade: FadeTrade,
  averageClosePrice: number,
  cfg: FadeConfig,
): Promise<void> {
  const dir = trade.direction as FadeDirection;
  const pnlActual = signedPips(trade.entry_price, averageClosePrice, dir);
  const reason = inferCloseReason(averageClosePrice, trade);
  const result: FadeTradeResult =
    reason === 'sl_hit' ? 'loss' : reason === 'tp_hit' ? 'win' : pnlActual >= 0 ? 'win' : 'loss';
  const accountingPips = result === 'win' ? cfg.targetPips : -cfg.stopPips;
  await persistClose(
    trade,
    {
      result,
      exit_price: averageClosePrice,
      pnl_pips: reason === 'external_close' ? pnlActual : accountingPips,
      pnl_pips_actual: pnlActual,
      closed_at: new Date().toISOString(),
      close_reason: reason,
    },
    cfg.pair,
  );
}

function isPastMaxHold(trade: FadeTrade, maxHoldHours: number): boolean {
  const opened = new Date(trade.opened_at ?? trade.created_at).getTime();
  return Date.now() - opened >= maxHoldHours * 60 * 60 * 1000;
}

async function forceCloseMaxHold(
  trade: FadeTrade,
  cfg: FadeConfig,
  broker: BrokerClient,
): Promise<void> {
  if (!trade.oanda_trade_id) return;
  try {
    const closeResult = await broker.closeTrade(trade.oanda_trade_id);
    const fillPrice =
      closeResult.orderFillTransaction?.price != null
        ? Number(closeResult.orderFillTransaction.price)
        : trade.entry_price;
    const pnlActual = signedPips(trade.entry_price, fillPrice, trade.direction as FadeDirection);
    await persistClose(
      trade,
      {
        result: 'max_hold',
        exit_price: fillPrice,
        pnl_pips: pnlActual,
        pnl_pips_actual: pnlActual,
        closed_at: new Date().toISOString(),
        close_reason: 'max_hold_4h',
      },
      cfg.pair,
    );
  } catch (err) {
    fadeError('Max-hold close failed', { id: trade.id, error: String(err) });
  }
}

async function processOpenTrade(trade: FadeTrade, cfg: FadeConfig): Promise<void> {
  if (!trade.oanda_trade_id) return;
  const supabase = getSupabaseClient();
  const broker = await resolveBrokerForFadeTrade(supabase, trade.broker_id);

  let details;
  try {
    details = await broker.getTradeById(trade.oanda_trade_id);
  } catch (err) {
    fadeWarn('getTradeById threw', { error: String(err) });
    return;
  }
  if (!details) return;

  if (details.state !== 'OPEN') {
    if (details.averageClosePrice == null) return;
    await handleBrokerClosure(trade, details.averageClosePrice, cfg);
    return;
  }

  if (isPastMaxHold(trade, cfg.maxHoldHours)) {
    await forceCloseMaxHold(trade, cfg, broker);
  }
}

export async function runFadeExitForAllBrokers(cfg: FadeConfig): Promise<void> {
  const tradeDate = todayUtcString();
  const openTrades = await loadOpenTrades(tradeDate, cfg.pair);
  for (const trade of openTrades) {
    await processOpenTrade(trade, cfg);
  }
}
