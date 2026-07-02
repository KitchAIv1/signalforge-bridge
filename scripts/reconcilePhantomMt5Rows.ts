/**
 * One-off: mark phantom VT rows (EXECUTED + pending + no ticket) as BLOCKED.
 * Run: npx tsx scripts/reconcilePhantomMt5Rows.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/connectors/supabase.js';

async function main(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: phantoms, error } = await supabase
    .from('bridge_trade_log')
    .select('id, broker_id, created_at, direction, signal_id')
    .eq('decision', 'EXECUTED')
    .eq('status', 'pending')
    .is('oanda_trade_id', null)
    .like('broker_id', 'vtmarkets_%');

  if (error) throw new Error(error.message);
  if (!phantoms?.length) {
    console.log('No phantom MT5 rows found.');
    return;
  }

  console.log(`Found ${phantoms.length} phantom row(s):`);
  for (const row of phantoms) {
    console.log(row);
  }

  const ids = phantoms.map((row) => String(row.id));
  const { data: updated, error: updateErr } = await supabase
    .from('bridge_trade_log')
    .update({
      decision: 'BLOCKED',
      block_reason: 'PHANTOM_RECONCILE: pre-insert row never received broker fill',
    })
    .in('id', ids)
    .eq('status', 'pending')
    .is('oanda_trade_id', null)
    .select('id, decision, block_reason');

  if (updateErr) throw new Error(updateErr.message);
  console.log('Reconciled:', updated);
}

main().catch((err) => {
  console.error('[reconcilePhantomMt5Rows] failed', err);
  process.exit(1);
});
