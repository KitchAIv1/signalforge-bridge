/**
 * OMEGA RAW sequenced replay — chronological Trail v1 simulation.
 *
 * RAW mode only: DTW direction as-fired, hybrid/window gates bypassed.
 * One-trade-at-a-time sequencing, trail + wall-clock max hold,
 * live-locked params (SHORT 2R / LONG 3R / trail 0.5R / 6h cap).
 *
 * Run:
 *   npx tsx scripts/omegaSequencedReplay.ts [since=2026-05-01] [maxHoldMin=180]
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { defaultReplayConfig, runSequencedReplay, summarizeReplay } from '../src/services/omegaReplay/runSequencedReplay.js';
import { buildDetailCsv, buildReportLines } from './omegaSequencedReplay/buildReport.js';
import { loadLiveFillBySignal, lookupLiveFill } from './omegaSequencedReplay/loadLiveFills.js';
import { loadShadowSignals } from './omegaSequencedReplay/loadShadowSignals.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');
const SUMMARY_PATH = join(OUT_DIR, 'omega_raw_sequenced_replay_summary.txt');
const DETAIL_PATH = join(OUT_DIR, 'omega_raw_sequenced_replay_detail.csv');

async function main(): Promise<void> {
  const sinceArg = process.argv[2] ?? '2026-05-01';
  const sinceIso = sinceArg.includes('T') ? sinceArg : `${sinceArg}T00:00:00.000Z`;
  const maxHoldMinutes = Number(process.argv[3] ?? '180');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);

  console.log(`OMEGA RAW replay since ${sinceIso.slice(0, 10)} (maxHold=${maxHoldMinutes}min)…`);

  const [signalLoad, liveFillMap] = await Promise.all([
    loadShadowSignals(supabase, sinceIso),
    loadLiveFillBySignal(supabase, sinceIso),
  ]);

  console.log(
    `Signals: ${signalLoad.signals.length} usable / ${signalLoad.fetchedTotal} fetched ` +
      `(skip dir=${signalLoad.skippedNoDirection} candles=${signalLoad.skippedNoCandles} zeroR=${signalLoad.skippedZeroR})`,
  );
  console.log(`Live OANDA fills mapped: ${liveFillMap.size}`);

  const config = defaultReplayConfig({ rawMode: true, maxHoldMinutes });

  const rows = runSequencedReplay(
    signalLoad.signals,
    liveFillMap,
    config,
    (signal) => lookupLiveFill(liveFillMap, signal.signalId, signal.firedAtIso, signal.direction),
  );
  const summary = summarizeReplay(rows, sinceIso, config);
  const reportLines = buildReportLines(summary, rows);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SUMMARY_PATH, reportLines.join('\n'));
  writeFileSync(DETAIL_PATH, buildDetailCsv(rows));

  console.log(reportLines.join('\n'));
  console.log(`\nSaved: ${SUMMARY_PATH}`);
  console.log(`Detail: ${DETAIL_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
