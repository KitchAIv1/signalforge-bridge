/**
 * FadeEngine — orchestrator for the EURUSD-gated AUDUSD SMA50 mean-reversion fade.
 *
 * Self-contained in-bridge paper engine (OANDA practice). Bypasses signalRouter and
 * omega. Mirrors closed trades into bridge_trade_log for Activity visibility.
 *
 * Wiring (src/index.ts), gated by AUDUSD_FADE_ENABLED=true:
 *   every 30s     → runMonitors()  (exit before entry)
 *   22:00 UTC     → hardClose()    (daily safety flatten)
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { loadAllOpenTrades, updateTrade } from './fadeDayState.js';
import { syncFadeTradeToBridgeLog } from './fadeBridgeSync.js';
import { resolveBrokerForFadeTrade } from './fadeBrokerResolver.js';
import { runEntryMonitor } from './fadeEntryMonitor.js';
import { runExitMonitor } from './fadeExitMonitor.js';
import { fadeError, fadeLog } from './fadeLogger.js';
import type { FadeConfig, FadeDirection, FadeTrade } from './fadeTypes.js';
import { loadFadeConfig, signedPips } from './fadeTypes.js';

function isEnabled(): boolean {
  return process.env.AUDUSD_FADE_ENABLED === 'true';
}

export async function runMonitors(): Promise<void> {
  if (!isEnabled()) return;
  const cfg = loadFadeConfig();
  // Exit before entry: free the one-trade-at-a-time slot before evaluating a new setup.
  await runExitMonitor(cfg);
  await runEntryMonitor(cfg);
}

async function hardCloseOne(trade: FadeTrade, cfg: FadeConfig): Promise<void> {
  if (!trade.oanda_trade_id) return;
  try {
    const broker = await resolveBrokerForFadeTrade(getSupabaseClient(), trade.broker_id);
    const closeResult = await broker.closeTrade(trade.oanda_trade_id);
    const fillPrice =
      closeResult.orderFillTransaction?.price != null
        ? Number(closeResult.orderFillTransaction.price)
        : trade.entry_price;
    const pnlActual = signedPips(trade.entry_price, fillPrice, trade.direction as FadeDirection);
    const closeFields = {
      result: 'force_close' as const,
      exit_price: fillPrice,
      pnl_pips: pnlActual,
      pnl_pips_actual: pnlActual,
      closed_at: new Date().toISOString(),
      close_reason: 'hard_close_safety',
    };
    await updateTrade(trade.id, closeFields);
    await syncFadeTradeToBridgeLog({ ...trade, ...closeFields });
    fadeLog('Hard-closed fade trade', { id: trade.id, fillPrice, pnlActual });
  } catch (err) {
    fadeError('Hard close failed for trade', {
      id: trade.id,
      oandaTradeId: trade.oanda_trade_id,
      error: String(err),
    });
  }
}

export async function hardClose(): Promise<void> {
  const cfg = loadFadeConfig();
  const openTrades = await loadAllOpenTrades(cfg.pair);
  if (!openTrades.length) {
    fadeLog('Hard close — no open positions');
    return;
  }
  for (const trade of openTrades) {
    await hardCloseOne(trade, cfg);
  }
  fadeLog('Hard close complete', { closed: openTrades.length });
}
