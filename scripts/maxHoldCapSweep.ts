/**
 * Sweep max-hold caps vs live OMEGA outcomes (OANDA fills + M5 trail sim).
 *
 * Run: npx tsx scripts/maxHoldCapSweep.ts [since=2026-05-01] [cohort=long|all|max_hold]
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fetchM5BarsAfterEntry } from '../src/services/shadowTrailExit/fetchEntryCandles.js';
import { CAP_PRESETS } from './maxHoldCapAnalysis/capPresets.js';
import { loadMaxHoldTrades, loadOandaOmegaTrades } from './maxHoldCapAnalysis/loadTrades.js';
import { buildMethodologyLines } from './maxHoldCapAnalysis/reportSummary.js';
import { simulateLiveOmegaTrail } from './maxHoldCapAnalysis/simulateLiveTrail.js';
import { buildSweepSummaryLines, type SweepRow } from './maxHoldCapAnalysis/sweepReport.js';
import type { LiveTradeRow, TradeDirection } from './maxHoldCapAnalysis/types.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(SCRIPT_DIR, 'output', 'max_hold_cap_sweep_summary.txt');
const CSV_PATH = join(SCRIPT_DIR, 'output', 'max_hold_cap_sweep_detail.csv');
const FETCH_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDirection(raw: string): TradeDirection | null {
  const dir = raw.toLowerCase();
  return dir === 'long' || dir === 'short' ? dir : null;
}

function pairToOandaInstrument(pair: string): string {
  const letters = pair.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 6) return `${letters.slice(0, 3)}_${letters.slice(3, 6)}`;
  return pair;
}

function pickCohort(all: LiveTradeRow[], maxHold: LiveTradeRow[], mode: string): LiveTradeRow[] {
  if (mode === 'max_hold') return maxHold;
  if (mode === 'long') return all.filter((r) => (r.duration_minutes ?? 0) > 150);
  return all;
}

async function sweepTrade(row: LiveTradeRow): Promise<SweepRow | null> {
  const direction = normalizeDirection(row.direction);
  if (!direction) return null;

  const fillPrice = Number(row.fill_price);
  const stopLoss = Number(row.stop_loss);
  if (!Number.isFinite(fillPrice) || !Number.isFinite(stopLoss)) return null;

  const instrument = pairToOandaInstrument(row.pair ?? 'AUD_USD');
  const bars = await fetchM5BarsAfterEntry(instrument, row.signal_received_at);
  if (bars.length < 5) return null;

  const caps: SweepRow['caps'] = {};
  for (const preset of CAP_PRESETS) {
    caps[preset.label] = simulateLiveOmegaTrail(
      direction,
      fillPrice,
      stopLoss,
      bars,
      preset.bars,
      Date.parse(row.signal_received_at),
    );
  }

  return {
    ticket: row.oanda_trade_id,
    livePips: row.pnl_pips != null ? Number(row.pnl_pips) : null,
    liveDurMin: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    liveCloseReason: row.close_reason,
    caps,
  };
}

function writeCsv(rows: SweepRow[]): void {
  const capHeaders = CAP_PRESETS.flatMap((p) => [`${p.label}_net_pips`, `${p.label}_exit`]);
  const header = ['ticket', 'live_pips', 'live_dur_min', 'live_reason', ...capHeaders].join(',');
  const body = rows.map((row) => {
    const capCols = CAP_PRESETS.flatMap((p) => {
      const sim = row.caps[p.label];
      return [sim?.netPips ?? '', sim?.exitReason ?? ''];
    });
    return [row.ticket, row.livePips, row.liveDurMin, row.liveCloseReason, ...capCols].join(',');
  });
  writeFileSync(CSV_PATH, [header, ...body].join('\n'));
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

  console.log(`Sweep ${CAP_PRESETS.map((p) => p.label).join(', ')} on ${cohort.length} trades…`);

  const rows: SweepRow[] = [];
  let skipped = 0;

  for (let i = 0; i < cohort.length; i += 1) {
    const result = await sweepTrade(cohort[i]!);
    if (!result) {
      skipped += 1;
      continue;
    }
    rows.push(result);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${cohort.length}`);
    await sleep(FETCH_DELAY_MS);
  }

  const liveTotal = rows.reduce((s, r) => s + (r.livePips ?? 0), 0);
  const maxHoldRows = rows.filter((r) => r.liveCloseReason === 'max_hold');

  const lines = [
    'OMEGA MAX HOLD CAP SWEEP — multiple caps vs LIVE',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${sinceIso.slice(0, 10)} | Cohort: ${cohortMode}`,
    `Caps tested: ${CAP_PRESETS.map((p) => `${p.minutes}min (${p.bars} bars)`).join(', ')}`,
    `Simulated: ${rows.length} | Skipped: ${skipped}`,
    '',
    ...buildMethodologyLines(),
    ...buildSweepSummaryLines('FULL COHORT', rows, CAP_PRESETS, liveTotal),
    ...buildSweepSummaryLines('LIVE close_reason = max_hold', maxHoldRows, CAP_PRESETS,
      maxHoldRows.reduce((s, r) => s + (r.livePips ?? 0), 0)),
  ];

  writeFileSync(OUT_PATH, lines.join('\n'));
  writeCsv(rows);
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${OUT_PATH}`);
  console.log(`Detail: ${CSV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
