/**
 * TD Sequential exhaustion vs AMD distribution backtest (CSV + OANDA D1).
 * Run: npx ts-node scripts/amdTdSequentialBacktest.ts
 *
 * Note: Use `import ... from '../src/connectors/oanda'` (no .js) so ts-node resolves
 * the TypeScript source; `*.js` suffix matches tsc emit but breaks ts-node require.
 *
 * Requires: OANDA_API_TOKEN, OANDA_ENVIRONMENT (see src/connectors/oanda.ts)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fetchCompletedCandles } from '../src/connectors/oanda';
import { csvEscape } from './amdBackfillCsv';

const INSTRUMENT = 'AUD_USD';
const OANDA_SLEEP_MS = 600;
const D1_LOOKBACK_CALENDAR_DAYS = 40;

type D1Candle = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

type CsvRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string;
  layer4_d1_bias: string;
  layer4_bullish_count: string;
  layer4_bearish_count: string;
  judas_direction: string;
  distribution_direction: string;
  predicted_direction: string;
  alignment_correct: string;
};

type TdSequentialResult = {
  bearish_setup_count: number;
  bullish_setup_count: number;
  bearish_exhaustion: boolean;
  bullish_exhaustion: boolean;
  d1_candles_fetched: number;
};

type OutputRow = CsvRow & {
  bearish_setup_count: number;
  bullish_setup_count: number;
  bearish_exhaustion: boolean;
  bullish_exhaustion: boolean;
  d1_candles_fetched: number;
  exhaustion_conflicts_amd: boolean | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadRawCsvRows(csvPath: string): Record<string, string>[] {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.trim().split('\n');
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const rowObj: Record<string, string> = {};
    headers.forEach((headerNameCell, idx) => {
      rowObj[headerNameCell.trim()] = (values[idx] ?? '').trim();
    });
    return rowObj;
  });
}

function recordToCsvRow(rec: Record<string, string>): CsvRow {
  const cell = (key: string): string => rec[key] ?? '';
  return {
    trade_date: cell('trade_date'),
    amd_tag: cell('amd_tag'),
    daily_bias_alignment: cell('daily_bias_alignment'),
    layer4_d1_bias: cell('layer4_d1_bias'),
    layer4_bullish_count: cell('layer4_bullish_count'),
    layer4_bearish_count: cell('layer4_bearish_count'),
    judas_direction: cell('judas_direction'),
    distribution_direction: cell('distribution_direction'),
    predicted_direction: cell('predicted_direction'),
    alignment_correct: cell('alignment_correct'),
  };
}

type DistributionCsvRead = {
  rows: CsvRow[];
  totalFromFile: number;
  skippedFlatInsufficient: number;
};

function readDistributionCsv(): DistributionCsvRead {
  const csvPath = path.join(
    process.cwd(),
    'scripts',
    'output',
    'amd_distribution_backtest.csv',
  );
  const rawRows = loadRawCsvRows(csvPath);
  const totalFromFile = rawRows.length;
  let skippedFlatInsufficient = 0;
  const rows: CsvRow[] = [];
  for (const rec of rawRows) {
    const distDir = (rec['distribution_direction'] ?? '').trim();
    if (distDir === 'INSUFFICIENT' || distDir === 'FLAT') {
      skippedFlatInsufficient++;
      continue;
    }
    rows.push(recordToCsvRow(rec));
  }
  console.log(
    `[TdSeq] Filtered ${skippedFlatInsufficient} rows (FLAT/INSUFFICIENT distribution_direction)`,
  );
  return { rows, totalFromFile, skippedFlatInsufficient };
}

async function fetchD1CandlesForDate(tradeDateYmd: string): Promise<D1Candle[]> {
  const tradeDateMs = Date.parse(`${tradeDateYmd}T00:00:00.000Z`);
  const fromDate = new Date(
    tradeDateMs - D1_LOOKBACK_CALENDAR_DAYS * 24 * 3600 * 1000,
  );
  const fromISO = fromDate.toISOString().split('T')[0] + 'T00:00:00.000000000Z';
  const toISO = `${tradeDateYmd}T00:00:00.000000000Z`;

  const candles = await fetchCompletedCandles(INSTRUMENT, 'D', fromISO, toISO);
  return candles as D1Candle[];
}

function computeTdSequential(candles: D1Candle[]): TdSequentialResult {
  if (candles.length < 5) {
    return {
      bearish_setup_count: 0,
      bullish_setup_count: 0,
      bearish_exhaustion: false,
      bullish_exhaustion: false,
      d1_candles_fetched: candles.length,
    };
  }

  const closes = candles.map((c) => parseFloat(c.mid.c));

  let bearish_setup_count = 0;
  let bullish_setup_count = 0;
  let currentBearishRun = 0;
  let currentBullishRun = 0;

  for (let i = 4; i < closes.length; i++) {
    const current = closes[i];
    const fourAgo = closes[i - 4];

    if (!Number.isFinite(current) || !Number.isFinite(fourAgo)) {
      currentBearishRun = 0;
      currentBullishRun = 0;
      continue;
    }

    if (current < fourAgo) {
      currentBearishRun++;
      currentBullishRun = 0;
    } else if (current > fourAgo) {
      currentBullishRun++;
      currentBearishRun = 0;
    } else {
      currentBearishRun = 0;
      currentBullishRun = 0;
    }
  }

  bearish_setup_count = currentBearishRun;
  bullish_setup_count = currentBullishRun;

  return {
    bearish_setup_count,
    bullish_setup_count,
    bearish_exhaustion: bearish_setup_count >= 9,
    bullish_exhaustion: bullish_setup_count >= 9,
    d1_candles_fetched: candles.length,
  };
}

function computeExhaustionConflict(
  row: CsvRow,
  td: TdSequentialResult,
): boolean | null {
  if (!td.bearish_exhaustion && !td.bullish_exhaustion) return null;

  const predicted = row.predicted_direction;

  if (td.bearish_exhaustion && predicted === 'DOWN') {
    return true;
  }
  if (td.bullish_exhaustion && predicted === 'UP') {
    return true;
  }

  return false;
}

function writeCsv(results: OutputRow[]): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_td_sequential_backtest.csv');
  const headerColumns = [
    'trade_date',
    'amd_tag',
    'daily_bias_alignment',
    'layer4_d1_bias',
    'layer4_bullish_count',
    'layer4_bearish_count',
    'judas_direction',
    'distribution_direction',
    'predicted_direction',
    'alignment_correct',
    'd1_candles_fetched',
    'bearish_setup_count',
    'bullish_setup_count',
    'bearish_exhaustion',
    'bullish_exhaustion',
    'exhaustion_conflicts_amd',
  ];
  const lines = [headerColumns.join(',')];
  for (const recordRow of results) {
    lines.push(
      [
        csvEscape(recordRow.trade_date),
        csvEscape(recordRow.amd_tag),
        csvEscape(recordRow.daily_bias_alignment),
        csvEscape(recordRow.layer4_d1_bias),
        csvEscape(recordRow.layer4_bullish_count),
        csvEscape(recordRow.layer4_bearish_count),
        csvEscape(recordRow.judas_direction),
        csvEscape(recordRow.distribution_direction),
        csvEscape(recordRow.predicted_direction),
        csvEscape(recordRow.alignment_correct),
        csvEscape(recordRow.d1_candles_fetched),
        csvEscape(recordRow.bearish_setup_count),
        csvEscape(recordRow.bullish_setup_count),
        csvEscape(recordRow.bearish_exhaustion),
        csvEscape(recordRow.bullish_exhaustion),
        csvEscape(
          recordRow.exhaustion_conflicts_amd === null
            ? 'null'
            : String(recordRow.exhaustion_conflicts_amd),
        ),
      ].join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`[TdSeq] Wrote ${csvPath}`);
}

function isScorableAlignment(alignmentCell: string): boolean {
  return alignmentCell === 'true' || alignmentCell === 'false';
}

function pctAlignmentCorrect(sliceRows: OutputRow[]): string {
  const scored = sliceRows.filter((r) => isScorableAlignment(r.alignment_correct));
  if (scored.length === 0) return 'n/a';
  const hits = scored.filter((r) => r.alignment_correct === 'true').length;
  return `${Math.round((100 * hits) / scored.length)}%`;
}

function countBearishInRange(values: number[], lo: number, hi: number): number {
  return values.filter((v) => v >= lo && v <= hi).length;
}

function printSummaryHeader(
  totalFromFile: number,
  skippedFlatInsufficient: number,
  skippedEmptyPredicted: number,
  nTotal: number,
  lt5: number,
): void {
  console.log('\n=== TD SEQUENTIAL EXHAUSTION BACKTEST ===');
  console.log(`Total rows from CSV: ${totalFromFile}`);
  console.log(`Rows skipped (FLAT/INSUFFICIENT): ${skippedFlatInsufficient}`);
  if (skippedEmptyPredicted > 0) {
    console.log(`Rows skipped (empty predicted_direction): ${skippedEmptyPredicted}`);
  }
  console.log(`Rows processed: ${nTotal}`);
  console.log(`Rows with < 5 D1 candles (no count possible): ${lt5}`);
}

function printExhaustionFrequency(
  nTotal: number,
  bearEx: number,
  bullEx: number,
  noEx: number,
): void {
  const pct = (c: number): string =>
    nTotal === 0 ? '0.0' : ((100 * c) / nTotal).toFixed(1);
  console.log('');
  console.log('--- Exhaustion Frequency ---');
  console.log(
    `Bearish exhaustion (>=9 count, downtrend exhausted): ${bearEx} days (${pct(bearEx)}%)`,
  );
  console.log(
    `Bullish exhaustion (>=9 count, uptrend exhausted):  ${bullEx} days (${pct(bullEx)}%)`,
  );
  console.log(`No exhaustion:                                       ${noEx} days (${pct(noEx)}%)`);
}

function printKeyQuestionBlocks(
  conflicts: OutputRow[],
  agrees: OutputRow[],
  noFire: OutputRow[],
): void {
  console.log('');
  console.log(
    '--- Key Question: When TD Sequential flagged exhaustion, was AMD predicting the wrong direction? ---',
  );
  console.log(
    `Exhaustion CONFLICTS with AMD prediction:  n=${conflicts.length} | AMD alignment_correct on these days: ${pctAlignmentCorrect(conflicts)}`,
  );
  console.log(
    `Exhaustion AGREES with AMD prediction:     n=${agrees.length} | AMD alignment_correct on these days: ${pctAlignmentCorrect(agrees)}`,
  );
  console.log(
    `No exhaustion fired:                       n=${noFire.length} | AMD alignment_correct on these days: ${pctAlignmentCorrect(noFire)}`,
  );
}

function printAmdFailureWarnings(wrongAmd: OutputRow[]): void {
  const wrongWithConflict = wrongAmd.filter((r) => r.exhaustion_conflicts_amd === true);
  const wrongNoCatch = wrongAmd.filter((r) => r.exhaustion_conflicts_amd !== true);
  const pctWrong = (x: number): string =>
    wrongAmd.length === 0 ? '0.0' : ((100 * x) / wrongAmd.length).toFixed(1);
  console.log('');
  console.log('--- AMD Failures Where Exhaustion Would Have Warned ---');
  console.log(`AMD predicted WRONG (alignment_correct=false): ${wrongAmd.length} total`);
  console.log(
    `  Of those: TD Sequential had exhaustion conflict: ${wrongWithConflict.length} (${pctWrong(wrongWithConflict.length)}%) ← would have caught`,
  );
  console.log(
    `  Of those: TD Sequential had no signal:          ${wrongNoCatch.length} (${pctWrong(wrongNoCatch.length)}%) ← would not have caught`,
  );
}

const AMD_TAGS_FOR_SUMMARY = [
  'AMD_SHIFTED',
  'AMD_TEXTBOOK',
  'AMD_FAILED',
  'AMD_NONE',
  'AMD_COMPRESSION_BREAKOUT',
] as const;

function printExhaustionByTag(results: OutputRow[]): void {
  console.log('');
  console.log('--- By AMD Tag: Exhaustion conflict rate ---');
  for (const tag of AMD_TAGS_FOR_SUMMARY) {
    const tagRows = results.filter((r) => r.amd_tag === tag);
    const tagConf = tagRows.filter((r) => r.exhaustion_conflicts_amd === true);
    const denom = tagRows.length;
    const tagPct = denom === 0 ? '0.0' : ((100 * tagConf.length) / denom).toFixed(1);
    console.log(
      `${tag.padEnd(26)} | exhaustion conflicts: ${tagConf.length}/${denom} (${tagPct}%)`,
    );
  }
}

function printSetupCountDistribution(
  bearishCounts: number[],
  bullishCounts: number[],
): void {
  console.log('');
  console.log('--- Setup Count Distribution (all rows) ---');
  console.log(`Bearish count 0:  ${bearishCounts.filter((v) => v === 0).length} days`);
  console.log(`Bearish count 1-3: ${countBearishInRange(bearishCounts, 1, 3)} days`);
  console.log(`Bearish count 4-6: ${countBearishInRange(bearishCounts, 4, 6)} days`);
  console.log(
    `Bearish count 7-8: ${countBearishInRange(bearishCounts, 7, 8)} days (near exhaustion)`,
  );
  console.log(
    `Bearish count 9+:  ${bearishCounts.filter((v) => v >= 9).length} days (EXHAUSTION)`,
  );
  console.log(
    `Bullish count 9+:  ${bullishCounts.filter((v) => v >= 9).length} days (EXHAUSTION)`,
  );
}

function printSummary(
  results: OutputRow[],
  totalFromFile: number,
  skippedFlatInsufficient: number,
  skippedEmptyPredicted: number,
): void {
  const nTotal = results.length;
  const lt5 = results.filter((r) => r.d1_candles_fetched < 5).length;
  const bearEx = results.filter((r) => r.bearish_exhaustion).length;
  const bullEx = results.filter((r) => r.bullish_exhaustion).length;
  const noEx = results.filter((r) => !r.bearish_exhaustion && !r.bullish_exhaustion).length;
  const conflicts = results.filter((r) => r.exhaustion_conflicts_amd === true);
  const agrees = results.filter(
    (r) =>
      (r.bearish_exhaustion || r.bullish_exhaustion) &&
      r.exhaustion_conflicts_amd === false,
  );
  const noFire = results.filter(
    (r) => !r.bearish_exhaustion && !r.bullish_exhaustion,
  );
  const wrongAmd = results.filter((r) => r.alignment_correct === 'false');

  printSummaryHeader(
    totalFromFile,
    skippedFlatInsufficient,
    skippedEmptyPredicted,
    nTotal,
    lt5,
  );
  printExhaustionFrequency(nTotal, bearEx, bullEx, noEx);
  printKeyQuestionBlocks(conflicts, agrees, noFire);
  printAmdFailureWarnings(wrongAmd);
  printExhaustionByTag(results);
  printSetupCountDistribution(
    results.map((r) => r.bearish_setup_count),
    results.map((r) => r.bullish_setup_count),
  );
}

function shouldSkipCsvRow(row: CsvRow): boolean {
  return (
    row.distribution_direction === 'INSUFFICIENT' ||
    row.distribution_direction === 'FLAT' ||
    row.predicted_direction === ''
  );
}

async function buildOutputRowForTradeDate(row: CsvRow): Promise<OutputRow> {
  try {
    const d1Candles = await fetchD1CandlesForDate(row.trade_date);
    const td = computeTdSequential(d1Candles);
    const exhaustion_conflicts_amd = computeExhaustionConflict(row, td);
    return { ...row, ...td, exhaustion_conflicts_amd };
  } catch (err: unknown) {
    console.warn(
      `\n[TdSeq] ${row.trade_date} — D1 fetch failed:`,
      err instanceof Error ? err.message : err,
    );
    return {
      ...row,
      bearish_setup_count: 0,
      bullish_setup_count: 0,
      bearish_exhaustion: false,
      bullish_exhaustion: false,
      d1_candles_fetched: 0,
      exhaustion_conflicts_amd: null,
    };
  }
}

async function runTdSequentialLoop(csvRows: CsvRow[]): Promise<{
  results: OutputRow[];
  skippedEmptyPredicted: number;
}> {
  const results: OutputRow[] = [];
  let skippedEmptyPredicted = 0;

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (shouldSkipCsvRow(row)) {
      skippedEmptyPredicted++;
      continue;
    }
    process.stdout.write(
      `\r[TdSeq] Processing ${i + 1}/${csvRows.length}: ${row.trade_date}`,
    );
    results.push(await buildOutputRowForTradeDate(row));
    await sleep(OANDA_SLEEP_MS);
  }

  return { results, skippedEmptyPredicted };
}

async function main(): Promise<void> {
  dotenv.config();
  const { rows: csvRows, totalFromFile, skippedFlatInsufficient } =
    readDistributionCsv();
  console.log(`[TdSeq] Loaded ${csvRows.length} rows from distribution backtest CSV`);

  const { results, skippedEmptyPredicted } = await runTdSequentialLoop(csvRows);

  console.log('');
  writeCsv(results);
  printSummary(results, totalFromFile, skippedFlatInsufficient, skippedEmptyPredicted);
}

const scriptPath = process.argv[1] ?? '';
if (scriptPath.includes('amdTdSequentialBacktest')) {
  void main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[TdSeq] Fatal error:', err);
      process.exit(1);
    });
}
