/** Mirror closed scalper trades into bridge_trade_log for dashboard visibility. */

import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { scalperError, scalperLog } from './scalperLogger.js';
import type { ScalperDayState, ScalperTrade, ScalperTradeResult } from './scalperTypes.js';
import { loadScalperConfig } from './scalperTypes.js';

const SYNCABLE_RESULTS: ScalperTradeResult[] = [
  'win',
  'loss',
  'force_flat',
  'timeout_16h',
];

function mapBridgeResult(
  result: ScalperTradeResult,
  pnlPips: number | null,
): 'win' | 'loss' | 'breakeven' {
  if (result === 'win') return 'win';
  if (result === 'loss') return 'loss';
  if (pnlPips != null && pnlPips > 0) return 'win';
  if (pnlPips != null && pnlPips < 0) return 'loss';
  return 'breakeven';
}

function computePnlDollars(trade: ScalperTrade): number | null {
  if (trade.pnl_pips == null || trade.units == null) return null;
  const pipDollarValue = trade.units * 0.0001;
  return Math.round(trade.pnl_pips * pipDollarValue * 100) / 100;
}

function computePnlR(trade: ScalperTrade): number | null {
  if (trade.pnl_pips == null) return null;
  const { slPips } = loadScalperConfig();
  return Math.round((trade.pnl_pips / slPips) * 1000) / 1000;
}

async function mirrorAlreadyExists(oandaTradeId: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', 'scalper')
    .eq('oanda_trade_id', oandaTradeId);
  if (error) throw new Error(`mirrorAlreadyExists: ${error.message}`);
  return (count ?? 0) > 0;
}

function buildMirrorRow(trade: ScalperTrade, dayState: ScalperDayState): Record<string, unknown> {
  const openedAt = trade.opened_at ?? trade.created_at;
  return {
    signal_id: randomUUID(),
    engine_id: 'scalper',
    pair: trade.pair,
    direction: trade.direction,
    decision: 'EXECUTED',
    status: 'closed',
    result: mapBridgeResult(trade.result!, trade.pnl_pips_actual ?? trade.pnl_pips),
    fill_price: trade.entry_price,
    exit_price: trade.exit_price,
    stop_loss: trade.sl_price,
    take_profit: trade.tp_price,
    pnl_pips: trade.pnl_pips,
    pnl_dollars: computePnlDollars(trade),
    pnl_r: computePnlR(trade),
    close_reason: trade.close_reason,
    created_at: openedAt,
    signal_received_at: openedAt,
    closed_at: trade.closed_at ?? new Date().toISOString(),
    units: trade.units,
    oanda_trade_id: trade.oanda_trade_id,
    amd_tag: dayState.amd_tag ?? null,
    broker_id: 'oanda_practice',
  };
}

export async function syncScalperTradeToBridgeLog(
  trade: ScalperTrade,
  dayState: ScalperDayState,
): Promise<void> {
  if (!trade.result || !SYNCABLE_RESULTS.includes(trade.result)) return;
  if (trade.oanda_trade_id && await mirrorAlreadyExists(trade.oanda_trade_id)) {
    scalperLog('Bridge mirror already exists — skipping', {
      oandaTradeId: trade.oanda_trade_id,
    });
    return;
  }

  const { error } = await getSupabaseClient()
    .from('bridge_trade_log')
    .insert(buildMirrorRow(trade, dayState));
  if (error) {
    scalperError('Failed to mirror trade to bridge_trade_log', {
      tradeId: trade.id,
      error: error.message,
    });
    return;
  }
  scalperLog('Mirrored trade to bridge_trade_log', {
    tradeId: trade.id,
    oandaTradeId: trade.oanda_trade_id,
    result: trade.result,
  });
}
