/**
 * One-shot: close pending SPEEDFLOOR BLOCKED paper rows (status→closed + pnl).
 * Writes ONLY decision=BLOCKED + SPEEDFLOOR identity on AO live brokers.
 * Never touches EXECUTED / ao_shadow_paper.
 *
 * Usage:
 *   npx tsx scripts/backfillSpeedfloorPaperCloses.ts           # dry-run count
 *   npx tsx scripts/backfillSpeedfloorPaperCloses.ts --apply   # persist closes
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import {
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  OMEGA_AO_BROKER_IDS,
} from '../src/core/alphaOmega/alphaOmegaConstants.js';
import { processOpenSpeedfloorPapers } from '../src/core/alphaOmega/speedfloorPaper/processOpenSpeedfloorPapers.js';

loadEnv();

function supabaseService() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function countOpen(supabase: ReturnType<typeof supabaseService>): Promise<number> {
  const { count, error } = await supabase
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .eq('block_reason', ALPHAOMEGA_BLOCK_SPEED_FLOOR)
    .in('broker_id', [...OMEGA_AO_BROKER_IDS])
    .is('pnl_pips', null)
    .neq('status', 'closed');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const supabase = supabaseService();
  const openBefore = await countOpen(supabase);
  console.log(`[SpeedfloorPaperBackfill] open SPEEDFLOOR rows (sample≤1000): ${openBefore}`);
  if (!apply) {
    console.log('[SpeedfloorPaperBackfill] dry-run only — pass --apply to persist');
    return;
  }

  let totalClosedSignals = 0;
  let totalClosedRows = 0;
  for (let pass = 0; pass < 20; pass += 1) {
    const result = await processOpenSpeedfloorPapers(supabase, { limit: 500 });
    console.log(`[SpeedfloorPaperBackfill] pass ${pass + 1}`, result);
    totalClosedSignals += result.closedSignals;
    totalClosedRows += result.closedRows;
    if (result.closedSignals === 0) break;
  }

  const openAfter = await countOpen(supabase);
  console.log(
    JSON.stringify(
      {
        openBefore,
        openAfter,
        totalClosedSignals,
        totalClosedRows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
