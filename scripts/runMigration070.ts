/**
 * Apply migration 070 — seed alpha_omega_toxic_crack_skip_enabled (default false).
 *
 * Run: npx tsx scripts/runMigration070.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const KEY = 'alpha_omega_toxic_crack_skip_enabled';

async function run(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or service role key');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: readError } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .eq('config_key', KEY)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    console.log(
      `[Migration 070] ${KEY} already present (value=${JSON.stringify(existing.config_value)}) — nothing to do.`,
    );
    return;
  }

  const { error: insertError } = await supabase.from('bridge_config').insert({
    config_key: KEY,
    config_value: false,
    description:
      'When true, Lane B ALPHAOMEGA blocks place on shallow cracks (len=7, speed<=40) during refuse pre-tape (3h high block/no-crack rate + weak conf). Place-only; streak observe untouched. Default off.',
    category: 'alpha_omega',
  });
  if (insertError) throw new Error(insertError.message);

  console.log(`[Migration 070] Inserted ${KEY}=false (kill switch OFF).`);
}

void run().catch((err) => {
  console.error('[Migration 070] fatal', err);
  process.exit(1);
});
