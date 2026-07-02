/**
 * Atomically close an open bridge_trade_log row and send Telegram once on success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import { sendTradeClosedAlert } from '../services/telegram/alertTradeClose.js';
import type { TradeCloseAlertParams } from '../services/telegram/alertTradeClose.js';
import { resultFromPnl } from './tradeMonitorHelpers.js';

export async function finalizeOpenLogRowClose(
  supabase: SupabaseClient,
  logRowId: string,
  updateFields: Record<string, unknown>,
  alertParams: TradeCloseAlertParams,
  pnlDollars: number | null,
): Promise<boolean> {
  const { data: updatedRows, error } = await supabase
    .from('bridge_trade_log')
    .update(updateFields)
    .eq('id', logRowId)
    .eq('status', 'open')
    .select('id');

  if (error) {
    console.error('[TradeMonitor] Close update failed', {
      logRowId,
      error: error.message,
    });
    return false;
  }
  if (!updatedRows?.length) {
    return false;
  }

  recordClosedTrade(resultFromPnl(pnlDollars));
  void sendTradeClosedAlert(alertParams).catch((alertErr) => {
    console.warn('[TradeMonitor] Telegram close alert failed', {
      logRowId,
      error: String(alertErr),
    });
  });
  return true;
}
