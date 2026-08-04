/**
 * Apply migration 071 — ALPHAOMEGA dead-crack abort: trough_adverse_pips column
 * + kill-switch config key (defaults OFF).
 *
 * Run: npx tsx scripts/runMigration071.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const CONFIG_KEY = 'alpha_omega_dead_crack_abort_enabled';

const SQL = readFileSync(
  join(process.cwd(), 'migrations/071_alphaomega_dead_crack_abort.sql'),
  'utf8',
);

async function verifyColumn(): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/alpha_omega_position_state?limit=1&select=trough_adverse_pips`,
    {
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  return res.ok;
}

async function seedConfigKey(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: existing, error: readError } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) {
    console.log(
      `[Migration 071] ${CONFIG_KEY} already present (value=${JSON.stringify(existing.config_value)}).`,
    );
    return;
  }
  const { error: insertError } = await supabase.from('bridge_config').insert({
    config_key: CONFIG_KEY,
    config_value: false,
    description:
      'When true, Lane B ALPHAOMEGA closes a position that is >=30m old, never reached 1.5p favorable, and has been >=3p underwater (close_reason=alphaomega_dead_crack_abort). Checked last after hard stop and giveback trail, same 30s cycle. Shadow would_abort logs while off. Default off.',
    category: 'alpha_omega',
  });
  if (insertError) throw new Error(insertError.message);
  console.log(`[Migration 071] Inserted ${CONFIG_KEY}=false (kill switch OFF).`);
}

async function applyColumnViaManagementApi(): Promise<void> {
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]!;
  console.log(`[Migration 071] Applying column on project: ${projectRef}`);
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
    console.log('[Migration 071] Management API: SUCCESS');
  } else {
    const body = await mgmtRes.text();
    console.log(`[Migration 071] Management API status ${mgmtRes.status}: ${body}`);
  }
}

async function run(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY');
  }

  await seedConfigKey();

  if (await verifyColumn()) {
    console.log('[Migration 071] trough_adverse_pips column already present.');
    return;
  }

  await applyColumnViaManagementApi();

  if (await verifyColumn()) {
    console.log('[Migration 071] Verified — trough_adverse_pips column present.');
    return;
  }

  console.error('\n[Migration 071] Column still missing — deploy MUST wait until it exists.');
  console.log('Run this SQL in Supabase Dashboard -> SQL Editor:\n');
  console.log(SQL);
  process.exitCode = 1;
}

void run().catch((err) => {
  console.error('[Migration 071] fatal', err);
  process.exit(1);
});
