/**
 * Read-only audit: 5-candle weak bucket vs 7-candle truth for AMD_SHIFTED.
 * Run: npx tsx scripts/amdConflictedWeakD1/shiftedContaminationAudit.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { classifyD1Strength } from './conflictedWeakD1Logic.js';

dotenv.config();

const PAIR = 'AUD_USD';
const CSV_PATH = path.join(
  process.cwd(),
  'scripts/output/amd_conflicted_weak_d1_backtest.csv'
);

type AccBucket = { total: number; judasCorrect: number; d1Scored: number; d1Correct: number };

function initBucket(): AccBucket {
  return { total: 0, judasCorrect: 0, d1Scored: 0, d1Correct: 0 };
}

function addFromCsv(bucket: AccBucket, row: Record<string, string>): void {
  bucket.total += 1;
  if (row.judas_correct === 'true') bucket.judasCorrect += 1;
  if (row.d1_correct === 'true' || row.d1_correct === 'false') {
    bucket.d1Scored += 1;
    if (row.d1_correct === 'true') bucket.d1Correct += 1;
  }
}

function pct(correct: number, total: number): string {
  return total === 0 ? 'n/a' : `${Math.round((1000 * correct) / total) / 10}%`;
}

function printBucket(label: string, bucket: AccBucket): void {
  console.log(
    `  ${label} (n=${bucket.total}): Judas ${pct(bucket.judasCorrect, bucket.total)}, ` +
      `D1 ${pct(bucket.d1Correct, bucket.d1Scored)} (scored n=${bucket.d1Scored})`
  );
}

function parseCsv(path: string): Record<string, string>[] {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? '';
    });
    return row;
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Missing CSV: ${CSV_PATH}`);
  }

  const csvRows = parseCsv(CSV_PATH);
  const weakCsv = csvRows.filter((row) => row.d1_strength === 'weak');
  const shiftedInWeakCsv = weakCsv.filter((row) => row.amd_tag === 'AMD_SHIFTED');

  console.log('=== AMD_SHIFTED contamination audit (read-only) ===\n');
  console.log(`Weak D1 rows in CSV (5-candle classification): ${weakCsv.length}`);
  console.log(`  of which amd_tag = AMD_SHIFTED: ${shiftedInWeakCsv.length}`);
  console.log(
    `  non-SHIFTED weak: ${weakCsv.length - shiftedInWeakCsv.length}\n`
  );

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  const supabase = createClient(process.env.SUPABASE_URL!, key!);

  const dates = weakCsv.map((row) => row.date);
  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, amd_tag, layer4_bullish_count, layer4_bearish_count, ' +
        'layer4_bullish_count_7, layer4_bearish_count_7'
    )
    .eq('pair', PAIR)
    .in('trade_date', dates);

  if (error) throw new Error(error.message);

  const dbByDate = new Map((data ?? []).map((row) => [row.trade_date as string, row]));

  const shiftedWeakCorrect = initBucket();
  const nonShiftedWeak = initBucket();
  const shiftedMisclassified = initBucket();
  const unverifiable = initBucket();

  let shiftedWeakCount = 0;
  let misclassifiedCount = 0;
  let missing7Count = 0;

  for (const csvRow of weakCsv) {
    const dbRow = dbByDate.get(csvRow.date);
    if (!dbRow) {
      addFromCsv(unverifiable, csvRow);
      missing7Count += 1;
      continue;
    }

    const strength5 = classifyD1Strength(
      dbRow.layer4_bullish_count as number | null,
      dbRow.layer4_bearish_count as number | null
    );
    const bull7 = dbRow.layer4_bullish_count_7 as number | null;
    const bear7 = dbRow.layer4_bearish_count_7 as number | null;
    const strength7 =
      bull7 == null || bear7 == null
        ? ('unverifiable' as const)
        : classifyD1Strength(bull7, bear7);

    if (csvRow.amd_tag !== 'AMD_SHIFTED') {
      addFromCsv(nonShiftedWeak, csvRow);
      continue;
    }

    shiftedWeakCount += 1;

    if (strength7 === 'unverifiable') {
      addFromCsv(unverifiable, csvRow);
      missing7Count += 1;
      continue;
    }

    if (strength5 === 'weak' && strength7 === 'weak') {
      addFromCsv(shiftedWeakCorrect, csvRow);
    } else if (strength5 === 'weak' && strength7 !== 'weak') {
      misclassifiedCount += 1;
      addFromCsv(shiftedMisclassified, csvRow);
    } else {
      addFromCsv(shiftedWeakCorrect, csvRow);
    }
  }

  console.log('7-candle re-classification for SHIFTED days in 5-candle weak bucket:');
  console.log(`  SHIFTED in weak bucket: ${shiftedWeakCount}`);
  console.log(`  5-candle weak → 7-candle strong (misclassified): ${misclassifiedCount}`);
  console.log(`  missing/null 7-candle counts: ${missing7Count}\n`);

  console.log('Accuracy by split (peak≥8p outcomes from existing CSV):');
  printBucket('SHIFTED weak (7-candle confirms weak)', shiftedWeakCorrect);
  printBucket('NON-SHIFTED weak (5-candle correct)', nonShiftedWeak);
  printBucket('SHIFTED misclassified (5 weak, 7 not weak)', shiftedMisclassified);
  if (unverifiable.total > 0) {
    printBucket('Unverifiable (no 7-candle row)', unverifiable);
  }

  console.log('\nSample misclassified (date, 5c, 7c, judas_correct):');
  let samples = 0;
  for (const csvRow of weakCsv) {
    if (csvRow.amd_tag !== 'AMD_SHIFTED' || samples >= 8) continue;
    const dbRow = dbByDate.get(csvRow.date);
    if (!dbRow) continue;
    const strength7 = classifyD1Strength(
      dbRow.layer4_bullish_count_7 as number | null,
      dbRow.layer4_bearish_count_7 as number | null
    );
    const strength5 = classifyD1Strength(
      dbRow.layer4_bullish_count as number | null,
      dbRow.layer4_bearish_count as number | null
    );
    if (strength5 === 'weak' && strength7 !== 'weak') {
      console.log(
        `  ${csvRow.date}: 5c=${dbRow.layer4_bullish_count}up/${dbRow.layer4_bearish_count}dn ` +
          `7c=${dbRow.layer4_bullish_count_7}up/${dbRow.layer4_bearish_count_7}dn ` +
          `7class=${strength7} judas=${csvRow.judas_correct}`
      );
      samples += 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
