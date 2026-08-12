/** Mirror closed peak_fade trades into bridge_trade_log. */

import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { PEAK_FADE_ENGINE_ID, PEAK_FADE_RISK_REF_PIPS } from './peakFadeConstants.js';
import { peakFadeError, peakFadeLog } from './peakFadeLogger.js';
import type { PeakFadeResult, PeakFadeTrade } from './peakFadeTypes.js';

const SYNCABLE: PeakFadeResult[] = ['win', 'loss', 'force_close', 'external_close'];

function mapResult(
  result: PeakFadeResult,
  pnlPips: number | null,
): 'win' | 'loss' | 'breakeven' {
  if (result === 'win') return 'win';
  if (result === 'loss') return 'loss';
  if (pnlPips != null && pnlPips > 0) return 'win';
  if (pnlPips != null && pnlPips < 0) return 'loss';
  return 'breakeven';
}

function pnlDollars(trade: PeakFadeTrade): number | null {
  const pips = trade.pnl_pips_actual ?? trade.pnl_pips;
  if (pips == null || trade.units == null) return null;
  return Math.round(pips * trade.units * 0.0001 * 100) / 100;
}

async function mirrorExists(brokerTradeId: string, brokerId: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', PEAK_FADE_ENGINE_ID)
    .eq('oanda_trade_id', brokerTradeId)
    .eq('broker_id', brokerId);
  if (error) throw new Error(`peakFade mirrorExists: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function syncPeakFadeTradeToBridgeLog(trade: PeakFadeTrade): Promise<void> {
  if (!trade.result || !SYNCABLE.includes(trade.result)) return;
  const brokerId = trade.broker_id ?? 'unknown';
  if (
    trade.broker_trade_id &&
    (await mirrorExists(trade.broker_trade_id, brokerId))
  ) {
    return;
  }
  const openedAt = trade.opened_at ?? trade.created_at;
  const actual = trade.pnl_pips_actual ?? trade.pnl_pips;
  const { error } = await getSupabaseClient().from('bridge_trade_log').insert({
    signal_id: randomUUID(),
    engine_id: PEAK_FADE_ENGINE_ID,
    pair: trade.pair,
    direction: trade.direction,
    decision: 'EXECUTED',
    status: 'closed',
    result: mapResult(trade.result, actual),
    fill_price: trade.entry_price,
    exit_price: trade.exit_price,
    take_profit: trade.tp_price,
    stop_loss: null,
    pnl_pips: actual,
    pnl_dollars: pnlDollars(trade),
    pnl_r:
      actual != null
        ? Math.round((actual / PEAK_FADE_RISK_REF_PIPS) * 1000) / 1000
        : null,
    close_reason: trade.close_reason,
    created_at: openedAt,
    signal_received_at: openedAt,
    closed_at: trade.closed_at ?? new Date().toISOString(),
    units: trade.units,
    oanda_trade_id: trade.broker_trade_id,
    broker_id: brokerId,
  });
  if (error) {
    peakFadeError('bridge_trade_log mirror failed', {
      id: trade.id,
      error: error.message,
    });
    return;
  }
  peakFadeLog('Mirrored to bridge_trade_log', { id: trade.id, brokerId });
}
