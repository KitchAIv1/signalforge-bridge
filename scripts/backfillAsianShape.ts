/**
 * Backfill amd_state Asian shape columns from asian_m5_candles.
 * Dry-run by default — pass --execute to write.
 *
 * Run: npx tsx scripts/backfillAsianShape.ts
 * Run: npx tsx scripts/backfillAsianShape.ts --execute
 */

import * as dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { classifyAsianShape } from '../src/services/amdDetector/asianShapeClassifier.js';
import { fetchAsianM5Candles } from '../src/services/amdDetector/fetchAsianM5Candles.js';

dotenv.config();

const AUD_PAIR = 'AUD_USD';
const executeMode = process.argv.includes('--execute');
const VERIFICATION_SAMPLE_DATES = [
  '2025-05-01',
  '2025-08-15',
  '2025-12-01',
  '2026-03-01',
  '2026-06-16',
];

type DecisionSnapshot = {
  trade_date: string;
  amd_tag: string | null;
  auto_direction: string | null;
  decision_auto_direction: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

async function fetchDecisionSnapshots(
  supabase: SupabaseClient,
  tradeDates: string[],
): Promise<DecisionSnapshot[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, amd_tag, auto_direction, decision_auto_direction')
    .eq('pair', AUD_PAIR)
    .in('trade_date', tradeDates)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DecisionSnapshot[];
}

function printDecisionVerification(
  label: string,
  snapshots: DecisionSnapshot[],
): void {
  console.log(`\n=== Decision column verification (${label}) ===`);
  for (const row of snapshots) {
    console.log(
      `${row.trade_date}\tamd_tag=${row.amd_tag ?? 'NULL'}\tauto_direction=${row.auto_direction ?? 'NULL'}\tdecision_auto_direction=${row.decision_auto_direction ?? 'NULL'}`,
    );
  }
}

function reportDecisionColumnDiff(
  beforeRows: DecisionSnapshot[],
  afterRows: DecisionSnapshot[],
): void {
  console.log('\n=== Decision column before/after comparison ===');
  let allUnchanged = true;
  for (const before of beforeRows) {
    const after = afterRows.find((row) => row.trade_date === before.trade_date);
    if (!after) {
      allUnchanged = false;
      console.log(`${before.trade_date}\tMISSING AFTER BACKFILL`);
      continue;
    }
    const unchanged =
      before.amd_tag === after.amd_tag
      && before.auto_direction === after.auto_direction
      && before.decision_auto_direction === after.decision_auto_direction;
    if (!unchanged) allUnchanged = false;
    console.log(
      `${before.trade_date}\t${unchanged ? 'UNCHANGED' : 'CHANGED'}\t` +
        `before=[${before.amd_tag}, ${before.auto_direction}, ${before.decision_auto_direction}]\t` +
        `after=[${after.amd_tag}, ${after.auto_direction}, ${after.decision_auto_direction}]`,
    );
  }
  console.log(allUnchanged ? '\nPASS: all sample decision columns unchanged' : '\nFAIL: decision columns changed');
}

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const beforeSnapshots = await fetchDecisionSnapshots(supabase, VERIFICATION_SAMPLE_DATES);
  printDecisionVerification('before backfill', beforeSnapshots);

  const { data: amdRows, error: amdError } = await supabase
    .from('amd_state')
    .select('trade_date')
    .eq('pair', AUD_PAIR)
    .order('trade_date', { ascending: true });

  if (amdError) throw new Error(amdError.message);

  let wouldUpdate = 0;
  let skippedNoM5 = 0;
  let skippedClassify = 0;

  for (const raw of amdRows ?? []) {
    const tradeDate = String((raw as { trade_date: string }).trade_date);
    const asianM5 = await fetchAsianM5Candles(supabase, tradeDate);
    if (!asianM5) {
      skippedNoM5 += 1;
      console.log(`[skip-no-m5] ${tradeDate}`);
      continue;
    }

    const asianShape = classifyAsianShape(tradeDate, asianM5);
    if (!asianShape) {
      skippedClassify += 1;
      console.log(`[skip-classify] ${tradeDate}`);
      continue;
    }

    wouldUpdate += 1;
    console.log(
      `[${executeMode ? 'update' : 'dry-run'}] ${tradeDate} shape=${asianShape.shape} retrace=${asianShape.retracementPct}%`,
    );

    if (executeMode) {
      const { error: updateError } = await supabase
        .from('amd_state')
        .update({
          asian_turn_time: asianShape.turnTime,
          asian_turn_position: asianShape.turnPosition,
          asian_pre_turn_speed: asianShape.preTurnSpeed,
          asian_post_turn_speed: asianShape.postTurnSpeed,
          asian_retracement_pct: asianShape.retracementPct,
          asian_shape: asianShape.shape,
          asian_shape_unclassified_reason: asianShape.unclassifiedReason,
        })
        .eq('trade_date', tradeDate)
        .eq('pair', AUD_PAIR);

      if (updateError) {
        throw new Error(`update ${tradeDate}: ${updateError.message}`);
      }
    }
  }

  if (executeMode) {
    const afterSnapshots = await fetchDecisionSnapshots(supabase, VERIFICATION_SAMPLE_DATES);
    printDecisionVerification('after backfill', afterSnapshots);
    reportDecisionColumnDiff(beforeSnapshots, afterSnapshots);
  } else {
    console.log('\nDecision column after-check skipped in dry-run mode (no writes performed).');
  }

  console.log('\n=== Summary ===');
  console.log(`Mode: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`amd_state rows scanned: ${amdRows?.length ?? 0}`);
  console.log(`Would update / updated: ${wouldUpdate}`);
  console.log(`Skipped (no asian_m5_candles): ${skippedNoM5}`);
  console.log(`Skipped (classification null): ${skippedClassify}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
