/**
 * Every 30s: sync open trades with OANDA; close if past max_hold_hours; update bridge_trade_log.
 * On close: writes exit_price, pnl_dollars, result (win/loss/breakeven), closed_at, duration_minutes.
 *
 * P0 fix: Do not mark a trade closed when it's absent from OANDA open list if it was opened
 * very recently. OANDA can have a brief propagation lag before a newly filled trade appears.
 * Minimum age guard prevents false "closed" for trades like EUR_JPY 76 (2026-03-12).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades, closeTrade, getClosedTradeDetails } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import type { BridgeEngineRow } from '../types/config.js';

/** Do not infer "closed" from absent open list if trade age < this (OANDA propagation lag). */
const MIN_OPEN_AGE_MS = 60_000;

function resultFromPnl(pnlDollars: number | null): 'win' | 'loss' | 'breakeven' {
  if (pnlDollars == null) return 'breakeven';
  if (pnlDollars > 0) return 'win';
  if (pnlDollars < 0) return 'loss';
  return 'breakeven';
}

function durationMinutes(signalReceivedAt: string, closedAt: string): number | null {
  const a = new Date(signalReceivedAt).getTime();
  const b = new Date(closedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000 * 100) / 100;
}

export async function runTradeMonitor(
  supabase: SupabaseClient,
  engines: BridgeEngineRow[],
  maxHoldHours: number = 4
): Promise<void> {
  let oandaTrades: Awaited<ReturnType<typeof getOpenTrades>>;
  try {
    oandaTrades = await getOpenTrades();
  } catch (err) {
    console.error('[TradeMonitor] getOpenTrades failed — skipping cycle:', String(err));
    return;
  }
  const oandaIds = new Set(oandaTrades.map((t) => t.id));

  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select('id, oanda_trade_id, engine_id, signal_received_at')
    .eq('status', 'open')
    .not('oanda_trade_id', 'is', null);

  const engineById = new Map(engines.map((e) => [e.engine_id, e]));

  for (const row of logOpen ?? []) {
    const tid = row.oanda_trade_id as string;
    const openTime = row.signal_received_at as string;
    const engine = engineById.get(row.engine_id as string);
    const maxHold = (engine?.max_hold_hours ?? maxHoldHours) * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(openTime).getTime();

    if (!oandaIds.has(tid)) {
      if (elapsed < MIN_OPEN_AGE_MS) continue;
      const details = await getClosedTradeDetails(tid, openTime);
      const closedAt = details.closedTime ?? new Date().toISOString();
      const update: Record<string, unknown> = {
        status: 'closed',
        closed_at: closedAt,
        exit_price: details.exitPrice,
        pnl_dollars: details.pnlDollars,
        result: resultFromPnl(details.pnlDollars),
        duration_minutes: durationMinutes(openTime, closedAt),
      };
      await supabase.from('bridge_trade_log').update(update).eq('id', row.id);
      recordClosedTrade(resultFromPnl(details.pnlDollars));
      continue;
    }
    if (elapsed >= maxHold) {
      const closeResult = await closeTrade(tid);
      const fillTx = closeResult.orderFillTransaction;
      const closedAt = fillTx?.time ?? new Date().toISOString();
      const pnlDollars = fillTx?.pl != null ? parseFloat(fillTx.pl) : null;
      const update: Record<string, unknown> = {
        status: 'closed',
        close_reason: 'max_hold',
        closed_at: closedAt,
        exit_price: fillTx?.price != null ? parseFloat(fillTx.price) : null,
        pnl_dollars: pnlDollars,
        result: resultFromPnl(pnlDollars),
        duration_minutes: durationMinutes(openTime, closedAt),
      };
      await supabase.from('bridge_trade_log').update(update).eq('id', row.id);
      recordClosedTrade(resultFromPnl(pnlDollars));
    }
  }
}
