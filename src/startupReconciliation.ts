/**
 * On startup: reconcile OANDA open trades vs bridge_trade_log; pre-populate dedup from last 60s.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpenTrade } from './connectors/oanda.js';
import { getOpenTrades, getTradeById } from './connectors/oanda.js';
import { prePopulateDedupFromLog } from './core/conflictResolver.js';
import { computeDerivedFields, resultFromPnl } from './monitoring/tradeMonitorHelpers.js';
import { resolveAmdOandaAccountId } from './services/amd/resolveAmdOandaAccountId.js';

function resultFromPnlDollars(pnlDollars: number | null): string {
  return resultFromPnl(pnlDollars);
}

async function reconcileGhostOpenRow(
  supabase: SupabaseClient,
  row: { id: string; oanda_trade_id: string },
  accountId?: string,
): Promise<void> {
  const oandaTradeId = row.oanda_trade_id;
  const tradeDetails = await getTradeById(oandaTradeId, accountId);

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

async function forwardReconcileOpenTrades(
  supabase: SupabaseClient,
  oandaTrades: OpenTrade[],
  logIds: Set<string>,
): Promise<void> {
  for (const ot of oandaTrades) {
    if (logIds.has(ot.id)) continue;
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
    logIds.add(ot.id);
  }
}

export async function runStartupReconciliation(
  supabase: SupabaseClient,
): Promise<void> {
  const amdAccountId = resolveAmdOandaAccountId();
  const [mainTrades, amdTrades] = await Promise.all([
    getOpenTrades(),
    getOpenTrades(amdAccountId),
  ]);

  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, id, engine_id')
    .eq('status', 'open');
  const logIds = new Set(
    (logOpen ?? []).map(
      (r: { oanda_trade_id: string }) => r.oanda_trade_id,
    ),
  );
  const mainOpenIds = new Set(mainTrades.map((t) => t.id));
  const amdOpenIds = new Set(amdTrades.map((t) => t.id));

  await forwardReconcileOpenTrades(supabase, mainTrades, logIds);
  if (amdAccountId && amdAccountId !== process.env.OANDA_ACCOUNT_ID) {
    await forwardReconcileOpenTrades(supabase, amdTrades, logIds);
  }

  for (const row of logOpen ?? []) {
    const oandaTradeId = row.oanda_trade_id as string | null;
    if (!oandaTradeId) continue;

    const engineId = row.engine_id as string | null;
    const openOnMain = mainOpenIds.has(oandaTradeId);
    const openOnAmd = amdOpenIds.has(oandaTradeId);

    if (engineId === 'engine_amd') {
      if (openOnAmd) continue;
      try {
        await reconcileGhostOpenRow(supabase, {
          id: row.id as string,
          oanda_trade_id: oandaTradeId,
        }, amdAccountId);
      } catch (err: unknown) {
        console.error(
          `[Reconciliation] Error processing AMD trade ${oandaTradeId}:`,
          String(err),
        );
      }
      continue;
    }

    if (openOnMain) continue;

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
