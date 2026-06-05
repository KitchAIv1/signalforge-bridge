/**
 * Backfill judas_extreme_utc_hour + judas_timing from stored chart_data.ohlc.
 * Run: npx tsx scripts/backfillJudasTiming.ts
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { deriveJudasTiming } from '../src/services/amdDetector/judasTimingDeriver.js';

dotenv.config();

const PAIR = 'AUD_USD';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

async function runBackfill(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, chart_data, judas_direction, judas_extreme_price')
    .eq('pair', PAIR)
    .is('judas_timing', null)
    .not('chart_data', 'is', null)
    .in('judas_direction', ['UP', 'DOWN'])
    .order('trade_date', { ascending: true });

  if (error || !data) {
    throw new Error(`Fetch failed: ${error?.message ?? 'no data'}`);
  }

  let updated = 0;
  let skipped = 0;

  for (const row of data) {
    const derived = deriveJudasTiming(
      row.chart_data,
      row.judas_direction as string,
      row.judas_extreme_price as number | null,
    );
    if (derived.hour == null && derived.timing == null) {
      skipped += 1;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('amd_state')
      .update({
        judas_extreme_utc_hour: derived.hour,
        judas_timing: derived.timing,
      })
      .eq('trade_date', row.trade_date)
      .eq('pair', PAIR);

    if (updateErr) {
      console.error(`[Backfill] update failed ${row.trade_date}:`, updateErr.message);
      skipped += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    `[Backfill] processed ${data.length} rows, updated ${updated}, skipped ${skipped} (null result)`,
  );
}

runBackfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
