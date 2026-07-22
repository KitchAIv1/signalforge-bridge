/**
 * Authoritative Lane B AO close tagging for bridge_trade_log.
 * Survives races where tradeMonitor finalizes first, or the open-row lookup misses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logWarn } from '../../utils/logger.js';
import { computeAlphaOmegaClosePnlR } from './computeAlphaOmegaClosePnlR.js';

export interface AlphaOmegaCloseLogRow {
  id: string;
  status: string | null;
  close_reason: string | null;
  fill_price: number | null;
  stop_loss: number | null;
  units: number | null;
  direction: string | null;
}

export interface PersistAlphaOmegaClosedTradeLogParams {
  oandaTradeId: string;
  brokerId: string;
  reason: string;
  closedAt: string;
  exitPriceNum: number | null;
  pnlDollars: number | null;
  pnlPips: number | null;
}

/** bridge_trade_log has no r_size_raw — selecting it 404s the whole row lookup. */
const LOG_ROW_SELECT =
  'id, status, close_reason, fill_price, stop_loss, units, direction';

export function isAlphaOmegaCloseReason(closeReason: string | null | undefined): boolean {
  return (closeReason ?? '').startsWith('alphaomega_');
}

export async function resolveLogRowForAlphaOmegaClose(
  supabase: SupabaseClient,
  oandaTradeId: string,
  brokerId: string,
): Promise<AlphaOmegaCloseLogRow | null> {
  const openRow = await fetchLogRow(supabase, oandaTradeId, brokerId, 'open');
  if (openRow) return openRow;
  return fetchLatestLogRow(supabase, oandaTradeId, brokerId);
}

export async function persistAlphaOmegaClosedTradeLog(
  supabase: SupabaseClient,
  params: PersistAlphaOmegaClosedTradeLogParams,
): Promise<boolean> {
  const logRow = await resolveLogRowForAlphaOmegaClose(
    supabase,
    params.oandaTradeId,
    params.brokerId,
  );
  if (!logRow) {
    logWarn('[AlphaOmega] No bridge_trade_log row to tag after close', {
      oandaTradeId: params.oandaTradeId,
      brokerId: params.brokerId,
      reason: params.reason,
    });
    return false;
  }
  if (isAlphaOmegaCloseReason(logRow.close_reason)) {
    return true;
  }
  return writeClosedTradeLogWithRetry(supabase, logRow, params);
}

async function fetchLogRow(
  supabase: SupabaseClient,
  oandaTradeId: string,
  brokerId: string,
  status: 'open',
): Promise<AlphaOmegaCloseLogRow | null> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(LOG_ROW_SELECT)
    .eq('oanda_trade_id', oandaTradeId)
    .eq('broker_id', brokerId)
    .eq('status', status)
    .maybeSingle();
  if (error) {
    logWarn('[AlphaOmega] open log row lookup failed', {
      oandaTradeId,
      error: error.message,
    });
    return null;
  }
  return (data as AlphaOmegaCloseLogRow | null) ?? null;
}

async function fetchLatestLogRow(
  supabase: SupabaseClient,
  oandaTradeId: string,
  brokerId: string,
): Promise<AlphaOmegaCloseLogRow | null> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(LOG_ROW_SELECT)
    .eq('oanda_trade_id', oandaTradeId)
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logWarn('[AlphaOmega] latest log row lookup failed', {
      oandaTradeId,
      error: error.message,
    });
    return null;
  }
  return (data as AlphaOmegaCloseLogRow | null) ?? null;
}

async function writeClosedTradeLogWithRetry(
  supabase: SupabaseClient,
  logRow: AlphaOmegaCloseLogRow,
  params: PersistAlphaOmegaClosedTradeLogParams,
): Promise<boolean> {
  const payload = buildClosedTradeLogPayload(logRow, params);
  const firstErr = await applyClosedTradeLogUpdate(supabase, logRow.id, payload);
  if (!firstErr) return true;
  const retryErr = await applyClosedTradeLogUpdate(supabase, logRow.id, payload);
  if (!retryErr) return true;
  logWarn('[AlphaOmega] bridge_trade_log update after close failed', {
    oandaTradeId: params.oandaTradeId,
    logRowId: logRow.id,
    error: retryErr,
  });
  return false;
}

function buildClosedTradeLogPayload(
  logRow: AlphaOmegaCloseLogRow,
  params: PersistAlphaOmegaClosedTradeLogParams,
): Record<string, unknown> {
  const pnlDollars = params.pnlDollars;
  const result =
    pnlDollars == null ? 'breakeven' : pnlDollars > 0 ? 'win' : pnlDollars < 0 ? 'loss' : 'breakeven';
  const pnlR = computeAlphaOmegaClosePnlR({
    exitPrice: params.exitPriceNum,
    fillPrice: logRow.fill_price != null ? Number(logRow.fill_price) : null,
    direction: logRow.direction,
    rSizeRaw: null,
    pnlPips: params.pnlPips,
    pnlDollars,
    stopLoss: logRow.stop_loss != null ? Number(logRow.stop_loss) : null,
    units: logRow.units != null ? Number(logRow.units) : null,
  });
  return {
    status: 'closed',
    close_reason: params.reason,
    closed_at: params.closedAt,
    exit_price: params.exitPriceNum,
    pnl_dollars: pnlDollars,
    pnl_pips: params.pnlPips,
    pnl_r: pnlR,
    result,
  };
}

async function applyClosedTradeLogUpdate(
  supabase: SupabaseClient,
  logRowId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await supabase.from('bridge_trade_log').update(payload).eq('id', logRowId);
  return error?.message ?? null;
}
