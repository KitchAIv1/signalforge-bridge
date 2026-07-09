/**
 * Apply migration 057 — ALPHAOMEGA state tables (alpha_omega_streak_state,
 * alpha_omega_position_state) + kill-switch config key.
 *
 * Run: npx tsx scripts/runMigration057.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const SQL = readFileSync(
  join(process.cwd(), 'migrations/057_alphaomega_state.sql'),
  'utf8',
);

async function tableExists(table: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  return res.ok;
}

async function run(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY');
  }

  if (await tableExists('alpha_omega_streak_state') && await tableExists('alpha_omega_position_state')) {
    console.log('[Migration 057] Tables already exist — nothing to do.');
    return;
  }

  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]!;
  console.log(`[Migration 057] Applying on project: ${projectRef}`);

  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    },
  );

  if (mgmtRes.ok) {
    console.log('[Migration 057] Management API: SUCCESS');
  } else {
    const body = await mgmtRes.text();
    console.log(`[Migration 057] Management API status ${mgmtRes.status}: ${body}`);
  }

  if (await tableExists('alpha_omega_streak_state') && await tableExists('alpha_omega_position_state')) {
    console.log('[Migration 057] Verified — tables present.');
    return;
  }

  console.error('\n[Migration 057] Tables still missing.');
  console.log('Run this SQL in Supabase Dashboard -> SQL Editor:\n');
  console.log(SQL);
  process.exitCode = 1;
}

void run().catch(err => {
  console.error('[Migration 057] fatal', err);
  process.exit(1);
});
