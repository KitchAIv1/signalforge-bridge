/**
 * Multi-cap RAW sequenced replay — measure PnL from shorter max_hold + freed blocked trades.
 *
 * Run: npx tsx scripts/omegaCapSequencedCompare.ts [since=2026-06-26] [baselineMin=360]
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  capResultFromRows,
  compareCapReplays,
} from '../src/services/omegaReplay/compareCapReplays.js';
import {
  defaultReplayConfig,
  runSequencedReplay,
} from '../src/services/omegaReplay/runSequencedReplay.js';
import {
  buildCapCompareReport,
  buildFreedTradesCsv,
} from './omegaSequencedReplay/buildCapCompareReport.js';
import { loadLiveFillBySignal, lookupLiveFill } from './omegaSequencedReplay/loadLiveFills.js';
import { loadShadowSignalsWithFetch } from './omegaSequencedReplay/loadShadowSignalsWithFetch.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');
const SUMMARY_PATH = join(OUT_DIR, 'omega_cap_sequenced_compare_summary.txt');
const FREED_CSV_PATH = join(OUT_DIR, 'omega_cap_sequenced_freed_trades.csv');

const CAP_MINUTES = [150, 180, 240, 300, 360];

async function main(): Promise<void> {
  const sinceArg = process.argv[2] ?? '2026-06-26';
  const sinceIso = sinceArg.includes('T') ? sinceArg : `${sinceArg}T00:00:00.000Z`;
  const baselineMin = Number(process.argv[3] ?? '360');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);
  console.log(`CAP compare RAW replay since ${sinceIso.slice(0, 10)} baseline=${baselineMin}m…`);

  const signalLoad = await loadShadowSignalsWithFetch(supabase, sinceIso);
  const liveFillMap = await loadLiveFillBySignal(supabase, sinceIso);

  console.log(
    `Signals usable: ${signalLoad.signals.length} / ${signalLoad.fetchedTotal} ` +
      `(cache=${signalLoad.fromCache} oanda=${signalLoad.fromOanda} skip_candles=${signalLoad.skippedNoCandles})`,
  );

  const capResults = CAP_MINUTES.map((capMinutes) => {
    const config = defaultReplayConfig({ rawMode: true, maxHoldMinutes: capMinutes });
    const rows = runSequencedReplay(
      signalLoad.signals,
      liveFillMap,
      config,
      (signal) => lookupLiveFill(liveFillMap, signal.signalId, signal.firedAtIso, signal.direction),
    );
    return capResultFromRows(capMinutes, rows, config);
  });

  const comparison = compareCapReplays(baselineMin, capResults);
  const reportLines = buildCapCompareReport(comparison, sinceIso);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SUMMARY_PATH, reportLines.join('\n'));
  writeFileSync(FREED_CSV_PATH, buildFreedTradesCsv(comparison.freedByCap));

  console.log(reportLines.join('\n'));
  console.log(`\nSaved: ${SUMMARY_PATH}`);
  console.log(`Freed CSV: ${FREED_CSV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
