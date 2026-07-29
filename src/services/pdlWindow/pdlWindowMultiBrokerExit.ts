/**
 * PDL Window exit — broker SL reconcile + hard flatten at 13:00 UTC.
 * Always close-by-trade-id. Never touches Fade positions.
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { sendTradeClosedAlert } from '../telegram/alertTradeClose.js';
import { syncPdlTradeToBridgeLog } from './pdlWindowBridgeSync.js';
import { resolveBrokerForPdlTrade } from './pdlWindowBrokerResolver.js';
import {
  PDL_WINDOW_EXIT_HOUR_UTC,
  PDL_WINDOW_PAIR,
} from './pdlWindowConstants.js';
import {
  loadAllOpenPdlTrades,
  loadOpenPdlTrades,
  updatePdlTrade,
} from './pdlWindowDayState.js';
import {
  computePnlDollars,
  computePnlR,
  inferSlHit,
  netPipsAfterSpread,
  resultFromClose,
  signedTraderPips,
} from './pdlWindowPnl.js';
import type { PdlWindowTrade, PdlWindowTradeResult } from './pdlWindowTypes.js';
import type { BrokerClient } from '../../connectors/broker/types.js';

function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function persistClose(
  trade: PdlWindowTrade,
  exitPrice: number,
  closeReason: string,
  result: PdlWindowTradeResult,
): Promise<void> {
  const gross = signedTraderPips(trade.direction, trade.entry_price, exitPrice);
  const pnlPips = netPipsAfterSpread(gross);
  const unitsAbs = Math.abs(trade.units ?? 0);
  const pnlDollars = computePnlDollars(unitsAbs, pnlPips);
  const pnlR = computePnlR(pnlPips);
  const fields = {
    exit_price: exitPrice,
    pnl_pips: pnlPips,
    pnl_dollars: pnlDollars,
    pnl_r: pnlR,
    result,
    closed_at: new Date().toISOString(),
    close_reason: closeReason,
  };
  await updatePdlTrade(trade.id, fields);
  await syncPdlTradeToBridgeLog({ ...trade, ...fields });
  void sendTradeClosedAlert({
    engineId: 'pdl_window',
    instrument: PDL_WINDOW_PAIR,
    direction: trade.direction === 'short' ? 'SHORT' : 'LONG',
    entryPrice: trade.entry_price,
    exitPrice,
    pnlPips,
    pnlDollars,
    closeReason,
    durationMinutes: Math.floor(
      (Date.now() - new Date(trade.opened_at ?? trade.created_at).getTime()) / 60000,
    ),
  }).catch(() => {});
}

async function handleBrokerClosure(
  trade: PdlWindowTrade,
  exitPrice: number,
): Promise<void> {
  const reason = inferSlHit(trade.direction, exitPrice, trade.sl_price)
    ? 'sl_hit'
    : 'external_close';
  const gross = signedTraderPips(trade.direction, trade.entry_price, exitPrice);
  const netPips = netPipsAfterSpread(gross);
  await persistClose(trade, exitPrice, reason, resultFromClose(reason, netPips));
}

async function forceCloseTrade(
  trade: PdlWindowTrade,
  broker: BrokerClient,
  reason: string,
  result: PdlWindowTradeResult,
): Promise<void> {
  if (!trade.oanda_trade_id) return;
  try {
    const closeResult = await broker.closeTrade(trade.oanda_trade_id);
    const fillPrice =
      closeResult.orderFillTransaction?.price != null
        ? Number(closeResult.orderFillTransaction.price)
        : trade.entry_price;
    await persistClose(trade, fillPrice, reason, result);
  } catch (err) {
    console.error('[PdlWindow] force close failed', { id: trade.id, err: String(err) });
  }
}

async function processOpenTrade(trade: PdlWindowTrade): Promise<void> {
  if (!trade.oanda_trade_id) return;
  const supabase = getSupabaseClient();
  const broker = await resolveBrokerForPdlTrade(supabase, trade.broker_id);

  let details;
  try {
    details = await broker.getTradeById(trade.oanda_trade_id);
  } catch (err) {
    console.warn('[PdlWindow] getTradeById threw', String(err));
    return;
  }
  if (!details) return;

  if (details.state !== 'OPEN') {
    if (details.averageClosePrice == null) return;
    await handleBrokerClosure(trade, details.averageClosePrice);
    return;
  }

  if (new Date().getUTCHours() >= PDL_WINDOW_EXIT_HOUR_UTC) {
    await forceCloseTrade(trade, broker, 'time_exit_1300', 'time_exit');
  }
}

export async function runPdlWindowExitForAllBrokers(): Promise<void> {
  const tradeDate = todayUtcString();
  const openTrades = await loadOpenPdlTrades(tradeDate, PDL_WINDOW_PAIR);
  for (const trade of openTrades) {
    await processOpenTrade(trade);
  }
}

/** Hard flatten all open PDL trades (13:00 cron / recovery). */
export async function hardFlattenAllPdlTrades(): Promise<void> {
  const openTrades = await loadAllOpenPdlTrades(PDL_WINDOW_PAIR);
  const supabase = getSupabaseClient();
  for (const trade of openTrades) {
    if (!trade.oanda_trade_id) continue;
    const broker = await resolveBrokerForPdlTrade(supabase, trade.broker_id);
    await forceCloseTrade(trade, broker, 'time_exit_1300', 'time_exit');
  }
}
