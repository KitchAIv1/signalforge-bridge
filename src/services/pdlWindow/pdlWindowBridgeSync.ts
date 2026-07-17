import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  PDL_WINDOW_ENGINE_ID,
  PDL_WINDOW_HARD_SL_PIPS,
} from './pdlWindowConstants.js';
import type { PdlWindowTrade } from './pdlWindowTypes.js';

async function mirrorAlreadyExists(oandaTradeId: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', PDL_WINDOW_ENGINE_ID)
    .eq('oanda_trade_id', oandaTradeId);
  if (error) throw new Error(`pdl mirrorAlreadyExists: ${error.message}`);
  return (count ?? 0) > 0;
}

function mapBridgeResult(
  result: string,
  pnlPips: number | null,
): 'win' | 'loss' | 'breakeven' {
  if (result === 'win') return 'win';
  if (result === 'loss') return 'loss';
  if (pnlPips != null && pnlPips > 0) return 'win';
  if (pnlPips != null && pnlPips < 0) return 'loss';
  return 'breakeven';
}

function buildMirrorRow(trade: PdlWindowTrade): Record<string, unknown> {
  const openedAt = trade.opened_at ?? trade.created_at;
  return {
    signal_id: randomUUID(),
    engine_id: PDL_WINDOW_ENGINE_ID,
    pair: trade.pair,
    direction: 'LONG',
    decision: 'EXECUTED',
    status: 'closed',
    result: mapBridgeResult(trade.result!, trade.pnl_pips),
    fill_price: trade.entry_price,
    exit_price: trade.exit_price,
    stop_loss: trade.sl_price,
    take_profit: null,
    pnl_pips: trade.pnl_pips,
    pnl_dollars: trade.pnl_dollars,
    pnl_r: trade.pnl_r,
    close_reason: trade.close_reason,
    created_at: openedAt,
    signal_received_at: openedAt,
    closed_at: trade.closed_at ?? new Date().toISOString(),
    units: trade.units,
    oanda_trade_id: trade.oanda_trade_id,
    broker_id: trade.broker_id,
    amd_hard_sl_pips: PDL_WINDOW_HARD_SL_PIPS,
  };
}

export async function syncPdlTradeToBridgeLog(trade: PdlWindowTrade): Promise<void> {
  if (!trade.result) return;
  if (trade.oanda_trade_id && (await mirrorAlreadyExists(trade.oanda_trade_id))) {
    return;
  }
  const { error } = await getSupabaseClient()
    .from('bridge_trade_log')
    .insert(buildMirrorRow(trade));
  if (error) {
    console.error('[PdlWindow] bridge_trade_log mirror failed:', error.message);
  }
}
