/**
 * Apply migration 060 — ALPHAOMEGA peak-favorable-giveback trail column +
 * kill-switch config key (defaults OFF).
 *
 * Run: npx tsx scripts/runMigration060.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const SQL = readFileSync(
  join(process.cwd(), 'migrations/060_alphaomega_giveback_trail.sql'),
  'utf8',
);

async function verifyColumn(): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/alpha_omega_position_state?limit=1&select=peak_favorable_pips`,
    {
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  return res.ok;
}

async function run(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY');
  }

  if (await verifyColumn()) {
    console.log('[Migration 060] Column already exists — nothing to do.');
    return;
  }

  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]!;
  console.log(`[Migration 060] Applying on project: ${projectRef}`);

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
    console.log('[Migration 060] Management API: SUCCESS');
  } else {
    const body = await mgmtRes.text();
    console.log(`[Migration 060] Management API status ${mgmtRes.status}: ${body}`);
  }

  if (await verifyColumn()) {
    console.log('[Migration 060] Verified — peak_favorable_pips column present.');
    return;
  }

  console.error('\n[Migration 060] Column still missing.');
  console.log('Run this SQL in Supabase Dashboard -> SQL Editor:\n');
  console.log(SQL);
  process.exitCode = 1;
}

void run().catch((err) => {
  console.error('[Migration 060] fatal', err);
  process.exit(1);
});
