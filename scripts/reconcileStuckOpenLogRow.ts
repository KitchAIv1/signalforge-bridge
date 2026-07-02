/**
 * One-off: reconcile a bridge_trade_log row stuck open after broker already closed.
 * Run: npx tsx scripts/reconcileStuckOpenLogRow.ts [oanda_trade_id]
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/connectors/supabase.js';
import { resolveBrokerForLogRow } from '../src/services/broker/resolveBrokerForLogRow.js';
import { fetchClosedTradeSnapshotViaBroker } from '../src/monitoring/brokerTradeLifecycle.js';
import { computeDerivedFields, resultFromPnl } from '../src/monitoring/tradeMonitorHelpers.js';
import { normalizeBrokerTimestamp } from '../src/connectors/broker/normalizeBrokerTimestamp.js';

const TICKET = process.argv[2] ?? '486803477';

function durationMinutes(signalReceivedAt: string, closedAt: string): number | null {
  const startMs = Date.parse(signalReceivedAt);
  const endMs = Date.parse(closedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round(((endMs - startMs) / 60000) * 100) / 100;
}

async function main(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from('bridge_trade_log')
    .select('*')
    .eq('oanda_trade_id', TICKET)
    .eq('status', 'open')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) {
    console.log(`No open row for ticket ${TICKET} — already reconciled.`);
    return;
  }

  const openTime = String(row.signal_received_at ?? row.created_at);
  const broker = await resolveBrokerForLogRow(
    supabase,
    row.broker_id as string | null,
    row.engine_id as string,
  );
  const snapshot = await fetchClosedTradeSnapshotViaBroker(broker, TICKET, openTime);
  if (!snapshot.closedTime && broker.brokerType !== 'oanda') {
    throw new Error('Broker snapshot has no close time — position may still be open');
  }

  const closedAt = normalizeBrokerTimestamp(snapshot.closedTime ?? new Date());
  const derived = computeDerivedFields(row, snapshot.exitPrice, snapshot.pnlDollars);
  const update = {
    status: 'closed',
    closed_at: closedAt,
    exit_price: snapshot.exitPrice,
    pnl_dollars: snapshot.pnlDollars,
    result: resultFromPnl(snapshot.pnlDollars),
    close_reason: 'external_close_reconcile',
    duration_minutes: durationMinutes(openTime, closedAt),
    ...derived,
  };

  const { data: updated, error: updateErr } = await supabase
    .from('bridge_trade_log')
    .update(update)
    .eq('id', row.id)
    .eq('status', 'open')
    .select('id, status, pnl_dollars, closed_at');

  if (updateErr) throw new Error(updateErr.message);
  if (!updated?.length) {
    console.log('Row was not open — no change.');
    return;
  }

  console.log('Reconciled:', updated[0]);
}

main().catch((err) => {
  console.error('[reconcileStuckOpenLogRow] failed', err);
  process.exit(1);
});
