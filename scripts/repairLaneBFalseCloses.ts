/**
 * Reconcile oanda_phase2_demo bridge_trade_log rows against OANDA account ...-003.
 * Default: dry-run. Pass --apply to write Supabase updates.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { getTradeById } from '../src/connectors/oanda.js';
import { computeDerivedFields, resultFromPnl } from '../src/monitoring/tradeMonitorHelpers.js';

dotenv.config();

const LANE_B_BROKER = 'oanda_phase2_demo';
const applyWrites = process.argv.includes('--apply');

function durationMinutes(openIso: string, closeIso: string): number | null {
  const openMs = new Date(openIso).getTime();
  const closeMs = new Date(closeIso).getTime();
  if (Number.isNaN(openMs) || Number.isNaN(closeMs)) return null;
  return Math.round(((closeMs - openMs) / 60000) * 100) / 100;
}

async function loadLaneBRows(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(
      'id, created_at, signal_received_at, status, oanda_trade_id, fill_price, stop_loss, units, pair, direction, pnl_r, duration_minutes',
    )
    .eq('broker_id', LANE_B_BROKER)
    .eq('decision', 'EXECUTED')
    .not('oanda_trade_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function buildReopenPatch(): Record<string, unknown> {
  return {
    status: 'open',
    result: null,
    closed_at: null,
    exit_price: null,
    pnl_r: null,
    pnl_dollars: null,
    pnl_pips: null,
    close_reason: null,
    duration_minutes: null,
  };
}

function buildClosedPatch(
  row: Record<string, unknown>,
  trade: NonNullable<Awaited<ReturnType<typeof getTradeById>>>,
): Record<string, unknown> {
  const closedAt = trade.closeTime ?? new Date().toISOString();
  const exitPrice = trade.averageClosePrice;
  const pnlDollars = trade.realizedPL;
  const derived = computeDerivedFields(row, exitPrice, pnlDollars);
  const openIso = String(row.signal_received_at ?? row.created_at);
  return {
    status: 'closed',
    closed_at: closedAt,
    exit_price: exitPrice,
    pnl_dollars: pnlDollars,
    result: resultFromPnl(pnlDollars),
    duration_minutes: durationMinutes(openIso, closedAt),
    close_reason: 'external_close',
    ...derived,
  };
}

async function main() {
  const phase2Account = process.env.OANDA_PHASE2_ACCOUNT_ID?.trim();
  if (!phase2Account) throw new Error('Missing OANDA_PHASE2_ACCOUNT_ID');

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
  );

  const rows = await loadLaneBRows(supabase);
  console.log(`Lane B rows: ${rows.length}  apply=${applyWrites}`);

  for (const row of rows) {
    const tradeId = String(row.oanda_trade_id);
    const trade = await getTradeById(tradeId, phase2Account);
    const logStatus = String(row.status);
    const action =
      trade?.state === 'OPEN' && logStatus === 'closed'
        ? 'reopen'
        : trade?.state === 'CLOSED' && (row.pnl_r == null || logStatus === 'open')
          ? 'backfill_close'
          : 'noop';

    console.log(
      JSON.stringify({
        id: row.id,
        tradeId,
        logStatus,
        oandaState: trade?.state ?? 'MISSING',
        action,
        pnlR: row.pnl_r,
        duration: row.duration_minutes,
      }),
    );

    if (!applyWrites || action === 'noop' || !trade) continue;

    const patch =
      action === 'reopen' ? buildReopenPatch() : buildClosedPatch(row, trade);
    const { error } = await supabase.from('bridge_trade_log').update(patch).eq('id', row.id);
    if (error) console.error(`Update failed ${row.id}:`, error.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
