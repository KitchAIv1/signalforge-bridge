/**
 * Simulate AMD-guided direction + sizing from backfill CSV.
 * Run: npx tsx scripts/amdSimulation.ts
 * Reads: scripts/output/amd_backfill_results.csv (run amd backfill first)
 */

import * as fs from 'fs';
import * as path from 'path';
import { average, csvEscape, winPctFromPnl } from './amdBackfillCsv.ts';
import type { AmdTag } from './amdBackfillTypes.ts';

type ParsedTrade = {
  trade_id: string;
  created_at: string;
  direction: string;
  pnl_r: number;
  amd_tag: AmdTag;
  amd_trade_phase: string;
  judas_direction: string;
};

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

function utcHourFromCreatedAt(iso: string): number {
  return new Date(iso).getUTCHours();
}

function utcDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normDir(d: string): string {
  return d.trim().toLowerCase();
}

function judasToTradeDir(j: string): 'long' | 'short' | null {
  const u = j.trim().toUpperCase();
  if (u === 'UP') return 'long';
  if (u === 'DOWN') return 'short';
  return null;
}

function oppositeDir(side: 'long' | 'short'): 'long' | 'short' {
  return side === 'long' ? 'short' : 'long';
}

type SimDecision = {
  simulated_direction: string;
  size_multiplier: number;
};

function tagRuleDecision(
  tag: AmdTag,
  asianOnly: boolean,
  judasTrade: 'long' | 'short' | null,
  recordedDirectionNorm: string
): SimDecision {
  let simulated_direction = recordedDirectionNorm;
  let size_multiplier = 1.0;

  if (tag === 'AMD_TEXTBOOK') {
    if (asianOnly) size_multiplier = 0.75;
    else {
      if (judasTrade !== null) simulated_direction = oppositeDir(judasTrade);
      size_multiplier = 2.5;
    }
  } else if (tag === 'AMD_COMPRESSION_BREAKOUT') {
    if (asianOnly) size_multiplier = 0.75;
    else {
      if (judasTrade !== null) simulated_direction = judasTrade;
      size_multiplier = 1.5;
    }
  } else if (
    tag === 'AMD_SHIFTED' ||
    tag === 'AMD_PARTIAL' ||
    tag === 'AMD_DELAYED'
  ) {
    size_multiplier = 1.0;
  } else if (tag === 'AMD_FAILED') {
    size_multiplier = 0.25;
  } else if (tag === 'AMD_NONE') {
    size_multiplier = 0.5;
  } else if (tag === 'INSUFFICIENT_DATA') {
    size_multiplier = 0.75;
  }

  return { simulated_direction, size_multiplier };
}

function decisionForTrade(t: ParsedTrade): SimDecision {
  const hour = utcHourFromCreatedAt(t.created_at);
  const asianOnly = hour >= 0 && hour <= 7;
  const judasTrade = judasToTradeDir(t.judas_direction);
  let { simulated_direction, size_multiplier } = tagRuleDecision(
    t.amd_tag,
    asianOnly,
    judasTrade,
    normDir(t.direction)
  );

  if (hour >= 17 && hour <= 23) size_multiplier = 0.5;

  return { simulated_direction, size_multiplier };
}

function simulatedPnlR(actual: number, actualDir: string, simDir: string, mult: number): number {
  const same = normDir(actualDir) === normDir(simDir);
  const sign = same ? 1 : -1;
  return sign * actual * mult;
}

function directionFlipped(actualDir: string, simDir: string): boolean {
  return normDir(actualDir) !== normDir(simDir);
}

function parseTrades(csvPath: string): ParsedTrade[] {
  const raw = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  if (raw.length < 2) return [];
  const header = parseCsvRow(raw[0]);
  const idx = (name: string) => header.indexOf(name);

  const out: ParsedTrade[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = parseCsvRow(raw[r]);
    if (cells.length < header.length) continue;
    out.push({
      trade_id: cells[idx('trade_id')],
      created_at: cells[idx('created_at')],
      direction: cells[idx('direction')],
      pnl_r: parseFloat(cells[idx('pnl_r')]),
      amd_tag: cells[idx('amd_tag')] as AmdTag,
      amd_trade_phase: cells[idx('amd_trade_phase')],
      judas_direction: cells[idx('judas_direction')] ?? '',
    });
  }
  return out;
}

type DateAggRow = {
  amd_tag: AmdTag;
  baselines: number[];
  simulated: number[];
};

function accumulateByUtcDate(rows: ParsedTrade[]): Map<string, DateAggRow> {
  const byDate = new Map<string, DateAggRow>();
  for (const t of rows) {
    const dk = utcDateKey(t.created_at);
    const sim = decisionForTrade(t);
    const simP = simulatedPnlR(
      t.pnl_r,
      t.direction,
      sim.simulated_direction,
      sim.size_multiplier
    );

    let bucket = byDate.get(dk);
    if (!bucket) {
      bucket = { amd_tag: t.amd_tag, baselines: [], simulated: [] };
      byDate.set(dk, bucket);
    }
    bucket.baselines.push(t.pnl_r);
    bucket.simulated.push(simP);
  }
  return byDate;
}

function formatSignedR(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`;
}

function printPerDateTable(rows: ParsedTrade[]): void {
  const byDate = accumulateByUtcDate(rows);
  const dates = [...byDate.keys()].sort();
  console.log('');
  console.log(
    'date | amd_tag | trades | baseline_avg_r | baseline_win_pct | ' +
      'simulated_avg_r | simulated_win_pct | size_weighted_r | improvement'
  );
  console.log('-'.repeat(100));

  for (const dk of dates) {
    const b = byDate.get(dk)!;
    const baselineAvg = average(b.baselines);
    const simAvg = average(b.simulated);
    const improvement = simAvg - baselineAvg;
    const sizeWeighted = average(b.simulated);
    console.log(
      `${dk} | ${b.amd_tag} | ${b.baselines.length} | ` +
        `${baselineAvg.toFixed(4)} | ${winPctFromPnl(b.baselines).toFixed(1)}% | ` +
        `${simAvg.toFixed(4)} | ${winPctFromPnl(b.simulated).toFixed(1)}% | ` +
        `${sizeWeighted.toFixed(4)} | ${formatSignedR(improvement)}`
    );
  }
}

function printOverallByTag(rows: ParsedTrade[]): void {
  const byTag = new Map<
    string,
    { baselines: number[]; simulated: number[] }
  >();
  for (const t of rows) {
    const { simulated_direction, size_multiplier } = decisionForTrade(t);
    const simP = simulatedPnlR(t.pnl_r, t.direction, simulated_direction, size_multiplier);
    const bucket = byTag.get(t.amd_tag) ?? { baselines: [], simulated: [] };
    bucket.baselines.push(t.pnl_r);
    bucket.simulated.push(simP);
    byTag.set(t.amd_tag, bucket);
  }

  console.log('');
  console.log(
    'amd_tag | n_trades | baseline_avg_r | simulated_avg_r | improvement | size_weighted_total_r'
  );
  console.log('-'.repeat(90));
  const tags = [...byTag.keys()].sort();
  for (const tg of tags) {
    const b = byTag.get(tg)!;
    const baselineAvg = average(b.baselines);
    const simAvg = average(b.simulated);
    const totalSim = b.simulated.reduce((a, n) => a + n, 0);
    const improvement = simAvg - baselineAvg;
    console.log(
      `${tg} | ${b.baselines.length} | ${baselineAvg.toFixed(4)} | ${simAvg.toFixed(4)} | ` +
        `${formatSignedR(improvement)} | ${totalSim.toFixed(4)}`
    );
  }
}

function writeSimulationCsv(rows: ParsedTrade[], outPath: string): void {
  const header =
    'trade_id,created_at,amd_tag,amd_trade_phase,actual_direction,' +
    'simulated_direction,actual_pnl_r,simulated_pnl_r,size_multiplier,direction_flipped';
  const lines = [header];
  for (const t of rows) {
    const { simulated_direction, size_multiplier } = decisionForTrade(t);
    const simP = simulatedPnlR(t.pnl_r, t.direction, simulated_direction, size_multiplier);
    lines.push(
      [
        csvEscape(t.trade_id),
        csvEscape(t.created_at),
        csvEscape(t.amd_tag),
        csvEscape(t.amd_trade_phase),
        csvEscape(t.direction),
        csvEscape(simulated_direction),
        csvEscape(t.pnl_r),
        csvEscape(simP),
        csvEscape(size_multiplier),
        csvEscape(directionFlipped(t.direction, simulated_direction)),
      ].join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
}

function main(): void {
  const csvPath = path.join(
    process.cwd(),
    'scripts',
    'output',
    'amd_backfill_results.csv'
  );
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing ${csvPath} — run AMD backfill first.`);
    process.exit(1);
  }

  const rows = parseTrades(csvPath);
  printPerDateTable(rows);
  printOverallByTag(rows);

  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'amd_simulation_results.csv');
  writeSimulationCsv(rows, outPath);
  console.log('');
  console.log(`Wrote ${outPath}`);
}

main();
