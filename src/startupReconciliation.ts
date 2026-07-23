/**
 * On startup: reconcile OANDA open trades vs bridge_trade_log; pre-populate dedup from last 60s.
 * Reverse ghost-close is broker-account aware (Phase2 / AMD / practice). MT5 rows are skipped.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpenTrade } from './connectors/oanda.js';
import { getOpenTrades, getTradeById } from './connectors/oanda.js';
import { prePopulateDedupFromLog } from './core/conflictResolver.js';
import { computeDerivedFields, resultFromPnl } from './monitoring/tradeMonitorHelpers.js';
import { resolveAmdOandaAccountId } from './services/amd/resolveAmdOandaAccountId.js';

interface OpenLogRow {
  id: string;
  oanda_trade_id: string | null;
  engine_id: string | null;
  broker_id: string | null;
}

function isMt5BrokerId(brokerId: string | null | undefined): boolean {
  return !!brokerId && brokerId.startsWith('vtmarkets_');
}

function resolvePhase2AccountId(): string | undefined {
  return process.env.OANDA_PHASE2_ACCOUNT_ID?.trim() || undefined;
}

/**
 * OANDA account for reverse-reconcile of a log row.
 * - `null` = skip (MT5, or Phase2 without OANDA_PHASE2_ACCOUNT_ID — never fall back to main)
 * - `undefined` = main practice account (SDK default)
 * - string = explicit account id (Phase2 / AMD)
 */
function resolveReconcileAccountId(
  brokerId: string | null | undefined,
  engineId: string | null | undefined,
  amdAccountId: string | undefined,
): string | null | undefined {
  if (isMt5BrokerId(brokerId)) return null;
  if (engineId === 'engine_amd') return amdAccountId;
  if (brokerId === 'oanda_phase2_demo') {
    return resolvePhase2AccountId() ?? null;
  }
  // practice / null / other OANDA → main account (undefined = SDK default)
  return undefined;
}

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

async function reverseReconcileOpenRow(
  supabase: SupabaseClient,
  row: OpenLogRow,
  openIdsByAccount: {
    main: Set<string>;
    amd: Set<string>;
    phase2: Set<string>;
  },
  amdAccountId: string | undefined,
): Promise<void> {
  const oandaTradeId = row.oanda_trade_id;
  if (!oandaTradeId) return;

  const accountId = resolveReconcileAccountId(row.broker_id, row.engine_id, amdAccountId);
  if (accountId === null) {
    console.log(
      `[Reconciliation] Skipping non-OANDA open row ${oandaTradeId}` +
        ` broker=${row.broker_id ?? 'null'}`,
    );
    return;
  }

  const openOnCorrectAccount =
    row.engine_id === 'engine_amd'
      ? openIdsByAccount.amd.has(oandaTradeId)
      : row.broker_id === 'oanda_phase2_demo'
        ? openIdsByAccount.phase2.has(oandaTradeId)
        : openIdsByAccount.main.has(oandaTradeId);

  if (openOnCorrectAccount) return;

  try {
    await reconcileGhostOpenRow(
      supabase,
      { id: row.id, oanda_trade_id: oandaTradeId },
      accountId,
    );
  } catch (err: unknown) {
    console.error(
      `[Reconciliation] Error processing ${oandaTradeId}` +
        ` broker=${row.broker_id ?? 'null'}:`,
      String(err),
    );
  }
}

export async function runStartupReconciliation(
  supabase: SupabaseClient,
): Promise<void> {
  const amdAccountId = resolveAmdOandaAccountId();
  const phase2AccountId = resolvePhase2AccountId();

  const [mainTrades, amdTrades, phase2Trades] = await Promise.all([
    getOpenTrades(),
    getOpenTrades(amdAccountId),
    phase2AccountId ? getOpenTrades(phase2AccountId) : Promise.resolve([] as OpenTrade[]),
  ]);

  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, id, engine_id, broker_id')
    .eq('status', 'open');

  const openRows = (logOpen ?? []) as OpenLogRow[];
  const logIds = new Set(
    openRows.map((r) => r.oanda_trade_id).filter((id): id is string => !!id),
  );
  const openIdsByAccount = {
    main: new Set(mainTrades.map((t) => t.id)),
    amd: new Set(amdTrades.map((t) => t.id)),
    phase2: new Set(phase2Trades.map((t) => t.id)),
  };

  // Forward: main + AMD only (do not invent Phase2/VT bridge rows on startup).
  await forwardReconcileOpenTrades(supabase, mainTrades, logIds);
  if (amdAccountId && amdAccountId !== process.env.OANDA_ACCOUNT_ID) {
    await forwardReconcileOpenTrades(supabase, amdTrades, logIds);
  }

  for (const row of openRows) {
    await reverseReconcileOpenRow(supabase, row, openIdsByAccount, amdAccountId);
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
