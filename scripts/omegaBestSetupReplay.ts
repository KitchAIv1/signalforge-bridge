/**
 * BEST SETUP replay — RAW sequenced, 180m max hold (Jun 26+ winner from cap sweep).
 * Exports every signal row: executed, blocked, pips, blocker tags.
 *
 * Run: npx tsx scripts/omegaBestSetupReplay.ts [since=2026-06-26] [maxHoldMin=180]
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
import { loadLiveFillBySignal, lookupLiveFill } from './omegaSequencedReplay/loadLiveFills.js';
import { loadShadowSignalsWithFetch } from './omegaSequencedReplay/loadShadowSignalsWithFetch.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');
const BEST_CAP_DEFAULT = 180;
const BASELINE_CAP = 360;

function csvEscape(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const text = String(value);
  return text.includes(',') ? `"${text}"` : text;
}

function buildAllTradesCsv(
  rows: ReturnType<typeof runSequencedReplay>,
  capMinutes: number,
  freedSignalIds: Set<string>,
): string {
  const header = [
    'cap_min',
    'fired_at',
    'hour_utc',
    'signal_id',
    'direction',
    'session',
    'status',
    'block_reason',
    'entry',
    'structure_stop',
    'r_pips',
    'exit_reason',
    'hold_min',
    'gross_pips',
    'net_pips',
    'freed_vs_360',
    'blocker_signal_id',
    'blocker_direction',
    'blocker_exit_360',
    'blocker_hold_360',
    'direction_vs_blocker',
    'blocker_was_max_hold_360',
    'shadow_pips_if_executed',
    'live_pips',
    'live_close_reason',
    'delta_sim_vs_live',
  ].join(',');

  const lines = rows.map((row) =>
    [
      capMinutes,
      row.firedAtIso,
      row.hourUtc,
      row.signalId,
      row.direction,
      row.sessionWindow,
      row.gateStatus,
      row.gateReason,
      row.entryPrice,
      row.structureStop,
      row.rPips,
      row.exitReason,
      row.holdMinutes,
      row.grossPips,
      row.netPips,
      freedSignalIds.has(row.signalId) ? 'YES' : row.gateStatus === 'executed' ? 'NO' : '',
      row.blockerSignalId,
      row.blockerDirection,
      row.blockerExitReason,
      row.blockerHoldMinutes,
      row.directionVsBlocker,
      row.blockerExitReason === 'max_hold' ? 'YES' : row.blockerExitReason ? 'NO' : '',
      row.shadowNetPipsIfExecuted,
      row.livePnlPips,
      row.liveCloseReason,
      row.deltaSimVsLive,
    ]
      .map(csvEscape)
      .join(','),
  );

  return [header, ...lines].join('\n');
}

function buildSummaryLines(
  sinceIso: string,
  capMinutes: number,
  signalLoad: Awaited<ReturnType<typeof loadShadowSignalsWithFetch>>,
  best: ReturnType<typeof capResultFromRows>,
  baseline: ReturnType<typeof capResultFromRows>,
  comparison: ReturnType<typeof compareCapReplays>,
): string[] {
  const executed = best.rows.filter((row) => row.gateStatus === 'executed');
  const blocked = best.rows.filter((row) => row.gateStatus === 'blocked_sequence');
  const freed = comparison.freedByCap.filter((row) => row.capMinutes === capMinutes);
  const freedPips = freed.reduce((sum, row) => sum + row.netPips, 0);
  const execPips = executed.reduce((sum, row) => sum + (row.netPips ?? 0), 0);
  const wins = executed.filter((row) => (row.netPips ?? 0) > 0).length;
  const liveRows = executed.filter((row) => row.livePnlPips != null);
  const livePips = liveRows.reduce((sum, row) => sum + (row.livePnlPips ?? 0), 0);

  const exitMix: Record<string, number> = {};
  for (const row of executed) {
    const key = row.exitReason ?? 'unknown';
    exitMix[key] = (exitMix[key] ?? 0) + 1;
  }

  const lines: string[] = [
    'OMEGA BEST SETUP — FULL TRADE EXTRACT',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${sinceIso.slice(0, 10)}`,
    '',
    '=== SETUP ===',
    'Mode: RAW (DTW as-fired, no hybrid/window gates)',
    'Sequencing: one trade at a time',
    'Trail: SHORT SL 2.0R | LONG SL 3.0R | trail 0.5R | activation 0R',
    `Max hold cap: ${capMinutes} minutes (${(capMinutes / 60).toFixed(1)}h)`,
    'Costs: 1.2p RT | Exit model: OANDA M5 bar walk',
    '',
    '=== DATA COVERAGE ===',
    `Signals in stream: ${signalLoad.fetchedTotal}`,
    `Simulated (with M5): ${signalLoad.signals.length}`,
    `  from cache: ${signalLoad.fromCache} | OANDA fetch: ${signalLoad.fromOanda}`,
    `Skipped (no candles): ${signalLoad.skippedNoCandles}`,
    '',
    '=== RESULTS @ BEST CAP ===',
    `Executed trades: ${executed.length}`,
    `Sequence blocked: ${blocked.length}`,
    `Total net pips (executed): ${execPips.toFixed(1)}p`,
    `Avg net pips/trade: ${executed.length ? (execPips / executed.length).toFixed(2) : 0}p`,
    `Win rate: ${executed.length ? ((wins / executed.length) * 100).toFixed(1) : 0}%`,
    'Exit mix:',
    ...Object.entries(exitMix).map(([reason, count]) => `  ${reason}: ${count}`),
    '',
    '=== vs 360m BASELINE ===',
    `360m executed: ${baseline.executedCount} | net pips: ${baseline.executedNetPips}p`,
    `180m executed: ${best.executedCount} | net pips: ${best.executedNetPips}p`,
    `Delta total pips: ${(best.executedNetPips - baseline.executedNetPips).toFixed(1)}p`,
    `Freed trades (blocked@360 → executed@${capMinutes}m): ${freed.length} | pips: ${freedPips.toFixed(1)}p`,
    `  same direction as blocker: ${freed.filter((row) => row.directionVsBlocker === 'same').length}`,
    `  opposite direction: ${freed.filter((row) => row.directionVsBlocker === 'opposite').length}`,
    `  blocker was max_hold@360: ${freed.filter((row) => row.blockerWasMaxHoldAtBaseline).length}`,
    '',
    '=== LIVE OVERLAP (where OANDA fill matched) ===',
    `Matched: ${liveRows.length} | Live net pips: ${livePips.toFixed(1)}p`,
    '',
    '=== ALL EXECUTED TRADES (chronological) ===',
    'fired_at          | dir   | net_pips | hold | exit          | freed@360 | live_pips',
  ];

  for (const row of executed) {
    const freedTag = freed.some((entry) => entry.signalId === row.signalId) ? 'YES' : 'no';
    lines.push(
      `${row.firedAtIso.slice(0, 16)} | ${row.direction.padEnd(5)} | ${(row.netPips ?? 0).toFixed(1).padStart(7)}p | ${String(row.holdMinutes ?? '').padStart(4)}m | ${String(row.exitReason ?? '').padEnd(13)} | ${freedTag.padEnd(9)} | ${row.livePnlPips != null ? row.livePnlPips.toFixed(1) + 'p' : 'n/a'}`,
    );
  }

  lines.push('');
  lines.push('=== FREED TRADES ONLY (blocked at 360m, ran at best cap) ===');
  for (const row of freed) {
    lines.push(
      `${row.firedAtIso.slice(0, 16)} | ${row.direction.padEnd(5)} | ${row.netPips.toFixed(1).padStart(7)}p | ${String(row.holdMinutes).padStart(4)}m | ${String(row.exitReason).padEnd(13)} | vs_blocker=${row.directionVsBlocker} | blocker@360=${row.blockerExitReasonBaseline}/${row.blockerHoldBaseline}m`,
    );
  }

  return lines;
}

async function main(): Promise<void> {
  const sinceArg = process.argv[2] ?? '2026-06-26';
  const sinceIso = sinceArg.includes('T') ? sinceArg : `${sinceArg}T00:00:00.000Z`;
  const capMinutes = Number(process.argv[3] ?? String(BEST_CAP_DEFAULT));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);
  console.log(`BEST SETUP replay since ${sinceIso.slice(0, 10)} cap=${capMinutes}m…`);

  const signalLoad = await loadShadowSignalsWithFetch(supabase, sinceIso);
  const liveFillMap = await loadLiveFillBySignal(supabase, sinceIso);
  const resolveFill = (signal: (typeof signalLoad.signals)[number]) =>
    lookupLiveFill(liveFillMap, signal.signalId, signal.firedAtIso, signal.direction);

  console.log(
    `Signals: ${signalLoad.signals.length}/${signalLoad.fetchedTotal} ` +
      `(cache=${signalLoad.fromCache} fetch=${signalLoad.fromOanda})`,
  );

  const runCap = (minutes: number) => {
    const config = defaultReplayConfig({ rawMode: true, maxHoldMinutes: minutes });
    const rows = runSequencedReplay(signalLoad.signals, liveFillMap, config, resolveFill);
    return capResultFromRows(minutes, rows, config);
  };

  const baseline = runCap(BASELINE_CAP);
  const best = runCap(capMinutes);
  const comparison = compareCapReplays(BASELINE_CAP, [baseline, best]);
  const freedIds = new Set(
    comparison.freedByCap.filter((row) => row.capMinutes === capMinutes).map((row) => row.signalId),
  );

  const summaryLines = buildSummaryLines(
    sinceIso,
    capMinutes,
    signalLoad,
    best,
    baseline,
    comparison,
  );

  const csv = buildAllTradesCsv(best.rows, capMinutes, freedIds);
  const baselineCsv = buildAllTradesCsv(baseline.rows, BASELINE_CAP, new Set());

  mkdirSync(OUT_DIR, { recursive: true });
  const prefix = `omega_best_setup_${capMinutes}m`;
  writeFileSync(join(OUT_DIR, `${prefix}_summary.txt`), summaryLines.join('\n'));
  writeFileSync(join(OUT_DIR, `${prefix}_all_trades.csv`), csv);
  writeFileSync(join(OUT_DIR, `omega_baseline_360m_all_trades.csv`), baselineCsv);

  console.log(summaryLines.join('\n'));
  console.log(`\nSaved:`);
  console.log(`  ${join(OUT_DIR, `${prefix}_summary.txt`)}`);
  console.log(`  ${join(OUT_DIR, `${prefix}_all_trades.csv`)}`);
  console.log(`  ${join(OUT_DIR, `omega_baseline_360m_all_trades.csv`)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
