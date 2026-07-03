/**
 * Max-hold cap analysis: 150min vs 360min vs live outcomes.
 * Closest sim to live OMEGA Trail v1 on OANDA fills.
 *
 * Run: npx tsx scripts/maxHoldCapAnalysis.ts [since=2026-05-01] [cohort=all|long|max_hold]
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fetchM5BarsAfterEntry } from '../src/services/shadowTrailExit/fetchEntryCandles.js';
import { loadMaxHoldTrades, loadOandaOmegaTrades } from './maxHoldCapAnalysis/loadTrades.js';
import { buildMethodologyLines, buildSummaryLines } from './maxHoldCapAnalysis/reportSummary.js';
import { runThreeCaps } from './maxHoldCapAnalysis/simulateLiveTrail.js';
import type { LiveTradeRow, TradeComparison, TradeDirection } from './maxHoldCapAnalysis/types.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(SCRIPT_DIR, 'output', 'max_hold_cap_150_vs_360_summary.txt');
const DETAIL_PATH = join(SCRIPT_DIR, 'output', 'max_hold_cap_150_vs_360_detail.csv');

const FETCH_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDirection(raw: string): TradeDirection | null {
  const dir = raw.toLowerCase();
  if (dir === 'long' || dir === 'short') return dir;
  return null;
}

function pairToOandaInstrument(pair: string): string {
  const letters = pair.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 6) return `${letters.slice(0, 3)}_${letters.slice(3, 6)}`;
  return pair;
}

async function analyzeTrade(row: LiveTradeRow): Promise<TradeComparison | null> {
  const direction = normalizeDirection(row.direction);
  if (!direction) return null;

  const fillPrice = Number(row.fill_price);
  const stopLoss = Number(row.stop_loss);
  if (!Number.isFinite(fillPrice) || !Number.isFinite(stopLoss)) return null;

  const instrument = pairToOandaInstrument(row.pair ?? 'AUD_USD');
  const bars = await fetchM5BarsAfterEntry(instrument, row.signal_received_at);
  if (bars.length < 5) return null;

  const sims = runThreeCaps(
    direction,
    fillPrice,
    stopLoss,
    bars,
    Date.parse(row.signal_received_at),
  );
  const livePips = row.pnl_pips != null ? Number(row.pnl_pips) : null;

  return {
    tradeId: row.id,
    ticket: row.oanda_trade_id,
    direction,
    liveCloseReason: row.close_reason,
    livePips,
    liveDurMin: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    sim150: sims.cap150,
    sim360: sims.cap360,
    simNoCap72: sims.noCap72,
    delta150VsLive: sims.cap150 && livePips != null ? sims.cap150.netPips - livePips : null,
    delta360VsLive: sims.cap360 && livePips != null ? sims.cap360.netPips - livePips : null,
    barsAvailable: bars.length,
  };
}

function pickCohort(
  all: LiveTradeRow[],
  maxHold: LiveTradeRow[],
  mode: string,
): LiveTradeRow[] {
  if (mode === 'max_hold') return maxHold;
  if (mode === 'long') return all.filter((r) => (r.duration_minutes ?? 0) > 150);
  return all;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return text.includes(',') ? `"${text}"` : text;
}

function writeDetailCsv(rows: TradeComparison[]): void {
  const header =
    'ticket,direction,live_reason,live_dur_min,live_pips,sim150_reason,sim150_bar,sim150_net_pips,' +
    'sim360_reason,sim360_bar,sim360_net_pips,delta150_vs_live,delta360_vs_live,bars';
  const lines = rows.map((r) =>
    [
      r.ticket,
      r.direction,
      r.liveCloseReason,
      r.liveDurMin,
      r.livePips,
      r.sim150?.exitReason,
      r.sim150?.exitBar,
      r.sim150?.netPips,
      r.sim360?.exitReason,
      r.sim360?.exitBar,
      r.sim360?.netPips,
      r.delta150VsLive,
      r.delta360VsLive,
      r.barsAvailable,
    ]
      .map(csvEscape)
      .join(','),
  );
  writeFileSync(DETAIL_PATH, [header, ...lines].join('\n'));
}

async function main(): Promise<void> {
  const sinceIso = `${process.argv[2] ?? '2026-05-01'}T00:00:00.000Z`;
  const cohortMode = process.argv[3] ?? 'long';

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');

  const supabase = createClient(url, key);
  const allTrades = await loadOandaOmegaTrades(supabase, sinceIso);
  const maxHoldTrades = await loadMaxHoldTrades(supabase, sinceIso);
  const cohort = pickCohort(allTrades, maxHoldTrades, cohortMode);

  console.log(`Analyzing ${cohort.length} trades (mode=${cohortMode}, since=${sinceIso.slice(0, 10)})…`);

  const comparisons: TradeComparison[] = [];
  let skipped = 0;

  for (let i = 0; i < cohort.length; i += 1) {
    const row = cohort[i]!;
    const result = await analyzeTrade(row);
    if (!result) {
      skipped += 1;
      continue;
    }
    comparisons.push(result);
    if ((i + 1) % 10 === 0) {
      console.log(`  ${i + 1}/${cohort.length} done…`);
    }
    await sleep(FETCH_DELAY_MS);
  }

  const over150 = comparisons.filter((r) => (r.liveDurMin ?? 0) > 150);
  const maxHoldRows = comparisons.filter((r) => r.liveCloseReason === 'max_hold');

  const lines: string[] = [
    'OMEGA MAX HOLD CAP ANALYSIS — 150min vs 360min vs LIVE',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${sinceIso.slice(0, 10)} | Primary cohort: ${cohortMode}`,
    `Trades attempted: ${cohort.length} | Simulated: ${comparisons.length} | Skipped (no candles): ${skipped}`,
    '',
    ...buildMethodologyLines(),
    `POPULATION COUNTS (simulated subset)`,
    `  All in cohort: ${comparisons.length}`,
    `  Live duration > 150min: ${over150.length}`,
    `  Live close_reason=max_hold: ${maxHoldRows.length}`,
    '',
    ...buildSummaryLines('FULL COHORT (simulated)', comparisons),
    ...buildSummaryLines('LIVE DURATION > 150 MIN', over150),
    ...buildSummaryLines('LIVE close_reason = max_hold', maxHoldRows),
  ];

  const cap150ExitMix = countExitMix(comparisons, (r) => r.sim150);
  const cap360ExitMix = countExitMix(comparisons, (r) => r.sim360);
  lines.push(
    'SIM 150min — exit reason mix:',
    ...Object.entries(cap150ExitMix).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'SIM 360min — exit reason mix:',
    ...Object.entries(cap360ExitMix).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'WORST 150-cap regressions vs live (delta < -5 pips):',
    ...worstDeltas(comparisons, -5),
    '',
    'BEST 150-cap improvements vs live (delta > +5 pips):',
    ...bestDeltas(comparisons, 5),
  );

  writeFileSync(OUT_PATH, lines.join('\n'));
  writeDetailCsv(comparisons);
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${OUT_PATH}`);
  console.log(`Detail: ${DETAIL_PATH}`);
}

function countExitMix(
  rows: TradeComparison[],
  pick: (row: TradeComparison) => TradeComparison['sim150'],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const sim = pick(row);
    const key = sim?.exitReason ?? 'missing';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function worstDeltas(rows: TradeComparison[], threshold: number): string[] {
  return rows
    .filter((r) => (r.delta150VsLive ?? 0) < threshold)
    .sort((a, b) => (a.delta150VsLive ?? 0) - (b.delta150VsLive ?? 0))
    .slice(0, 8)
    .map(
      (r) =>
        `  ticket ${r.ticket} live=${r.livePips?.toFixed(1)}p (${r.liveCloseReason}, ${r.liveDurMin?.toFixed(0)}min) → 150sim=${r.sim150?.netPips.toFixed(1)}p delta=${r.delta150VsLive?.toFixed(1)}`,
    );
}

function bestDeltas(rows: TradeComparison[], threshold: number): string[] {
  return rows
    .filter((r) => (r.delta150VsLive ?? 0) > threshold)
    .sort((a, b) => (b.delta150VsLive ?? 0) - (a.delta150VsLive ?? 0))
    .slice(0, 8)
    .map(
      (r) =>
        `  ticket ${r.ticket} live=${r.livePips?.toFixed(1)}p (${r.liveCloseReason}, ${r.liveDurMin?.toFixed(0)}min) → 150sim=${r.sim150?.netPips.toFixed(1)}p delta=${r.delta150VsLive?.toFixed(1)}`,
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
