/**
 * On startup: reconcile OANDA open trades vs bridge_trade_log; pre-populate dedup from last 60s.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades, getTradeById } from './connectors/oanda.js';
import { prePopulateDedupFromLog } from './core/conflictResolver.js';
import { computeDerivedFields, resultFromPnl } from './monitoring/tradeMonitorHelpers.js';

function resultFromPnlDollars(pnlDollars: number | null): string {
  return resultFromPnl(pnlDollars);
}

async function reconcileGhostOpenRow(
  supabase: SupabaseClient,
  row: { id: string; oanda_trade_id: string },
): Promise<void> {
  const oandaTradeId = row.oanda_trade_id;
  const tradeDetails = await getTradeById(oandaTradeId);

  if (tradeDetails === null) {
    console.warn(
      `[Reconciliation] Cannot fetch trade ${oandaTradeId} from OANDA — skipping`,
    );
    return;
  }

  if (tradeDetails.state !== 'CLOSED') return;

  const exitPrice = tradeDetails.averageClosePrice;
  const pnlDollars = tradeDetails.realizedPL;

  const { data: fullRow } = await supabase
    .from('bridge_trade_log')
    .select('fill_price, stop_loss, units, pair, direction, engine_id, entry_price')
    .eq('id', row.id)
    .maybeSingle();

  const derived = computeDerivedFields(
    (fullRow ?? {}) as Record<string, unknown>,
    exitPrice,
    pnlDollars,
  );
  const pnlR = derived.pnl_r != null ? Number(derived.pnl_r) : null;
  const result = resultFromPnlDollars(pnlDollars);

  const { error: updateErr } = await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      close_reason: 'reconciled_on_startup',
      closed_at: tradeDetails.closeTime ?? new Date().toISOString(),
      exit_price: exitPrice,
      pnl_dollars: pnlDollars,
      pnl_r: pnlR,
      pnl_pips: derived.pnl_pips ?? undefined,
      result,
    })
    .eq('id', row.id);

  if (updateErr) {
    console.error(
      `[Reconciliation] Failed to close bridge row for ${oandaTradeId}:`,
      updateErr.message,
    );
    return;
  }

  console.log(
    `[Reconciliation] Closed ghost trade ${oandaTradeId}` +
      ` | engine=${fullRow?.engine_id ?? 'unknown'}` +
      ` | pnl=$${pnlDollars ?? 'null'}` +
      ` | result=${result}`,
  );
}

export async function runStartupReconciliation(
  supabase: SupabaseClient,
): Promise<void> {
  // ── Forward reconciliation (existing — unchanged) ──────────────────────
  const oandaTrades = await getOpenTrades();
  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, id')
    .eq('status', 'open');
  const logIds = new Set(
    (logOpen ?? []).map(
      (r: { oanda_trade_id: string }) => r.oanda_trade_id,
    ),
  );
  const oandaOpenIds = new Set(oandaTrades.map((t) => t.id));

  for (const ot of oandaTrades) {
    if (!logIds.has(ot.id)) {
      await supabase.from('bridge_trade_log').insert({
        signal_id: ot.id,
        engine_id: 'reconciled',
        pair: ot.instrument,
        direction: ot.units.startsWith('-') ? 'SHORT' : 'LONG',
        stop_loss: 0,
        signal_received_at: ot.openTime ?? new Date().toISOString(),
        decision: 'EXECUTED',
        status: 'open',
        oanda_trade_id: ot.id,
        units: parseInt(ot.units, 10),
        notes: 'reconciled on startup',
      });
    }
  }
  // ── End forward reconciliation ─────────────────────────────────────────

  // ── Reverse reconciliation (NEW) ──────────────────────────────────────
  for (const row of logOpen ?? []) {
    const oandaTradeId = row.oanda_trade_id as string | null;
    if (!oandaTradeId) continue;
    if (oandaOpenIds.has(oandaTradeId)) continue;

    try {
      await reconcileGhostOpenRow(supabase, {
        id: row.id as string,
        oanda_trade_id: oandaTradeId,
      });
    } catch (err: unknown) {
      console.error(
        `[Reconciliation] Error processing ${oandaTradeId}:`,
        String(err),
      );
    }
  }
  // ── End reverse reconciliation ─────────────────────────────────────────

  // ── Dedup pre-population (existing — unchanged) ────────────────────────
  const { data: recent } = await supabase
    .from('bridge_trade_log')
    .select('pair, direction, signal_received_at')
    .eq('decision', 'EXECUTED')
    .gte(
      'signal_received_at',
      new Date(Date.now() - 60000).toISOString(),
    );
  prePopulateDedupFromLog(
    (recent ?? []) as Array<{
      pair: string;
      direction: string;
      signal_received_at: string;
    }>,
  );
}
