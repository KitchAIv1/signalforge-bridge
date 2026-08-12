/** Peak Fade exit monitor — detect broker TP / external close; record actual pips. */

import { getSupabaseClient } from '../../connectors/supabase.js';
import { sendTradeClosedAlert } from '../telegram/alertTradeClose.js';
import { PEAK_FADE_ENGINE_ID } from './peakFadeConstants.js';
import { syncPeakFadeTradeToBridgeLog } from './peakFadeBridgeSync.js';
import { resolveBrokerForPeakFadeTrade } from './peakFadeBrokerResolver.js';
import { loadAllOpenTrades, updateTrade } from './peakFadeDayState.js';
import { peakFadeError, peakFadeLog, peakFadeWarn } from './peakFadeLogger.js';
import type { PeakFadeConfig, PeakFadeDirection, PeakFadeTrade } from './peakFadeTypes.js';
import { signedPips } from './peakFadeTypes.js';

function inferCloseReason(
  close: number,
  trade: PeakFadeTrade,
): 'tp_hit' | 'external_close' {
  const dir = trade.direction;
  const atTp =
    dir === 'long' ? close >= Number(trade.tp_price) : close <= Number(trade.tp_price);
  return atTp ? 'tp_hit' : 'external_close';
}

async function persistClose(
  trade: PeakFadeTrade,
  exitPrice: number,
  reason: string,
  pair: string,
): Promise<void> {
  const pnlActual = signedPips(
    Number(trade.entry_price),
    exitPrice,
    trade.direction as PeakFadeDirection,
  );
  const result =
    reason === 'tp_hit'
      ? ('win' as const)
      : ('external_close' as const);
  const fields = {
    result,
    exit_price: exitPrice,
    pnl_pips: pnlActual,
    pnl_pips_actual: pnlActual,
    closed_at: new Date().toISOString(),
    close_reason: reason,
  };
  await updateTrade(trade.id, fields);
  await syncPeakFadeTradeToBridgeLog({ ...trade, ...fields });
  void sendTradeClosedAlert({
    engineId: PEAK_FADE_ENGINE_ID,
    instrument: pair,
    direction: trade.direction,
    entryPrice: Number(trade.entry_price),
    exitPrice,
    pnlPips: pnlActual,
    pnlDollars: Math.round(pnlActual * (trade.units ?? 0) * 0.0001 * 100) / 100,
    closeReason: reason,
    durationMinutes: Math.floor(
      (Date.now() - new Date(trade.opened_at ?? trade.created_at).getTime()) / 60_000,
    ),
  }).catch(() => {});
  peakFadeLog('Trade closed', { id: trade.id, reason, pnlActual });
}

async function processOpenTrade(trade: PeakFadeTrade, cfg: PeakFadeConfig): Promise<void> {
  if (!trade.broker_trade_id) return;
  let details;
  try {
    const broker = await resolveBrokerForPeakFadeTrade(
      getSupabaseClient(),
      trade.broker_id,
    );
    details = await broker.getTradeById(trade.broker_trade_id);
  } catch (err) {
    peakFadeWarn('getTradeById failed', { id: trade.id, error: String(err) });
    return;
  }
  if (!details) return;
  if (details.state === 'OPEN') return;
  if (details.averageClosePrice == null) return;
  const reason = inferCloseReason(details.averageClosePrice, trade);
  await persistClose(trade, details.averageClosePrice, reason, cfg.pair);
}

export async function runPeakFadeExitForAllBrokers(cfg: PeakFadeConfig): Promise<void> {
  const openTrades = await loadAllOpenTrades(cfg.pair);
  for (const trade of openTrades) {
    try {
      await processOpenTrade(trade, cfg);
    } catch (err) {
      peakFadeError('exit process failed', { id: trade.id, error: String(err) });
    }
  }
}
