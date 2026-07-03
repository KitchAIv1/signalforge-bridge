/**
 * Apply migration 054 — omega max_hold_hours 6 → 3.
 * Run: npx tsx scripts/omegaBestSetupApplyMigration.ts
 */

import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);

  const { data: before } = await supabase
    .from('bridge_engines')
    .select('engine_id, max_hold_hours')
    .eq('engine_id', 'omega')
    .single();

  console.log('Before:', before);

  const { error } = await supabase
    .from('bridge_engines')
    .update({ max_hold_hours: 3, updated_at: new Date().toISOString() })
    .eq('engine_id', 'omega');

  if (error) throw new Error(`Migration apply failed: ${error.message}`);

  const { data: after } = await supabase
    .from('bridge_engines')
    .select('engine_id, max_hold_hours, updated_at')
    .eq('engine_id', 'omega')
    .single();

  console.log('After:', after);

  const sqlPath = join(REPO_ROOT, 'migrations/054_omega_max_hold_3h.sql');
  console.log(`\nApplied equivalent of ${sqlPath}`);
  console.log('Bridge Realtime should hot-reload omega roster within seconds.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
