/**
 * Apply migration 069 — widen signals.execution_tier CHECK for AO tiers.
 *
 * Run: npx tsx scripts/runMigration069.ts
 * Prefers SUPABASE_ACCESS_TOKEN (Management API); falls back to service key.
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;
const ACCESS_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ?? SERVICE_KEY;

const SQL = readFileSync(
  join(process.cwd(), 'migrations/069_signals_ao_execution_tiers.sql'),
  'utf8',
);

async function probeAoObserveAllowed(): Promise<'ok' | 'blocked' | 'error'> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await sb
    .from('signals')
    .insert({
      engine_id: 'omega',
      pair: 'AUDUSD',
      direction: 'long',
      confluence_score: 1,
      stop_loss: 0.6995,
      entry_zone_low: 0.69982,
      entry_zone_high: 0.69982,
      stop_loss_pips: 3.2,
      regime: 'ranging',
      timeframe_primary: 'M5',
      execution_tier: 'ao_observe',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.message.includes('signals_execution_tier_check')) return 'blocked';
    console.error('[Migration 069] probe error:', error.message);
    return 'error';
  }
  if (data?.id) await sb.from('signals').delete().eq('id', data.id);
  return 'ok';
}

async function applyViaManagementApi(projectRef: string): Promise<boolean> {
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query: SQL }),
    },
  );
  if (mgmtRes.ok) {
    console.log('[Migration 069] Management API: SUCCESS');
    return true;
  }
  console.log(
    `[Migration 069] Management API status ${mgmtRes.status}: ${await mgmtRes.text()}`,
  );
  return false;
}

async function run(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or service role key');
  }
  const before = await probeAoObserveAllowed();
  if (before === 'ok') {
    console.log('[Migration 069] ao_observe already allowed — nothing to do.');
    return;
  }
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]!;
  console.log(`[Migration 069] Applying on project: ${projectRef}`);
  await applyViaManagementApi(projectRef);
  const after = await probeAoObserveAllowed();
  if (after === 'ok') {
    console.log('[Migration 069] Verified — ao_observe inserts succeed.');
    return;
  }
  console.error('[Migration 069] Still blocked. Run SQL in Dashboard:\n');
  console.log(SQL);
  process.exitCode = 1;
}

void run().catch((err) => {
  console.error('[Migration 069] fatal', err);
  process.exit(1);
});
