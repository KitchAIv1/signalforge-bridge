/**
 * Resequence + backfill optimized shadow columns (last 14 days).
 * Run after applying migration 050.
 *
 * Run: npx tsx scripts/resequenceShadowTrailExit.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/connectors/supabase.js';
import { applyAllSequencedGates } from '../src/services/shadowTrailExit/applySequencedGate.js';
import { backfillOptimizedShadowRows } from '../src/services/shadowTrailExit/backfillOptimizedShadowRows.js';
import type { ShadowTrailRow } from '../src/services/shadowTrailExit/types.js';

async function main(): Promise<void> {
  const supabase = getSupabaseClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('omega_shadow_trail_exit')
    .select('*')
    .gte('trade_date', since);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.log('[ShadowTrail] resequence: no rows');
    return;
  }

  const backfilled = await backfillOptimizedShadowRows(data as ShadowTrailRow[]);
  const gated = applyAllSequencedGates(backfilled);
  const { error: updateErr } = await supabase
    .from('omega_shadow_trail_exit')
    .upsert(gated, { onConflict: 'signal_id' });
  if (updateErr) {
    const message = updateErr.message;
    if (message.includes('sequenced_opt_pips_net') && message.includes('schema cache')) {
      throw new Error(
        `${message}\n\nApply migration 050 first:\n  npx tsx scripts/runMigration050.ts\n` +
          'Or run migrations/050_omega_shadow_trail_exit_opt.sql in Supabase SQL Editor.',
      );
    }
    throw new Error(message);
  }
  console.log('[ShadowTrail] resequence done', { rows: gated.length, since });
}

void main().catch(err => {
  console.error('[ShadowTrail] resequence fatal', err);
  process.exit(1);
});
