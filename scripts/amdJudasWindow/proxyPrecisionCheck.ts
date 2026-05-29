/**
 * Post-backfill: live-proxy → outcome TEXTBOOK precision.
 * Run: npx tsx scripts/amdJudasWindow/proxyPrecisionCheck.ts
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { computeDateFeatures } from '../../src/services/amdDetector/amdFeatures.js';
import { readOhlcFromChart, chartEntryToOhlc } from './chartOhlc.js';
import { evaluateAsianBreach } from './asianBreach.js';
import { detectJudasForWindow } from './judasDetect.js';
import { asianWickExtremes } from './asianExtremes.js';

dotenv.config();

const PAIR = 'AUD_USD';
const ASIAN_HOURS = [0, 1, 2, 3, 4, 5, 6, 7];

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, amd_outcome_tag, judas_pips, asian_range_pips, asian_is_flat, chart_data'
    )
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);
  if (error) throw new Error(error.message);

  let proxyCount = 0;
  let textbookOutcome = 0;
  let breachCount = 0;
  let breachTextbook = 0;

  for (const row of data ?? []) {
    const entries = readOhlcFromChart(row.chart_data as Record<string, unknown>);
    const allOhlc = entries.map(chartEntryToOhlc);
    const liveCandles = allOhlc.filter(
      (candle) => new Date(candle.time).getUTCHours() <= 9
    );
    const liveFeatures = computeDateFeatures(liveCandles, () => {});
    const isLiveProxy =
      liveFeatures.amd_tag === 'AMD_FAILED' &&
      (row.judas_pips ?? 0) >= 8 &&
      (row.asian_range_pips ?? 999) < 35 &&
      row.asian_is_flat;
    if (!isLiveProxy) continue;

    proxyCount += 1;
    if (row.amd_outcome_tag === 'AMD_TEXTBOOK') textbookOutcome += 1;

    const asianCandles = entries
      .filter((entry) =>
        ASIAN_HOURS.includes(new Date(entry.time).getUTCHours())
      )
      .map(chartEntryToOhlc);
    const asianPrices = asianWickExtremes(asianCandles);
    const detection = detectJudasForWindow(
      allOhlc,
      'current',
      row.asian_range_pips,
      row.asian_is_flat ?? false
    );
    const breach = evaluateAsianBreach(
      detection.judasDirection,
      detection.judasExtremePrice,
      asianPrices
    );
    if (breach.breachesAsianRange) {
      breachCount += 1;
      if (row.amd_outcome_tag === 'AMD_TEXTBOOK') breachTextbook += 1;
    }
  }

  const pct = (part: number, total: number) =>
    total === 0 ? 'n/a' : `${Math.round((1000 * part) / total) / 10}%`;

  console.log('\n=== Live-proxy → outcome TEXTBOOK ===');
  console.log(
    `FAILED@10:31 + flat + judas≥8 + asian<35: n=${proxyCount}, TEXTBOOK=${textbookOutcome} (${pct(textbookOutcome, proxyCount)})`
  );
  console.log(
    `+ CURRENT breach: n=${breachCount}, TEXTBOOK=${breachTextbook} (${pct(breachTextbook, breachCount)})`
  );

  const csvLines = fs
    .readFileSync('scripts/output/amd_judas_window_backtest.csv', 'utf8')
    .trim()
    .split('\n');
  const headers = csvLines[0].split(',');
  const cohort = csvLines.slice(1).map((line) => {
    const parts = line.split(',');
    const csvRow: Record<string, string> = {};
    headers.forEach((header, index) => {
      csvRow[header] = parts[index] ?? '';
    });
    return csvRow;
  }).filter(
    (csvRow) =>
      csvRow.judas_current_breach === 'true' &&
      csvRow.is_london_fix_day === 'false' &&
      csvRow.tag_window_current === 'AMD_TEXTBOOK'
  );

  const outcomeByDate = new Map(
    (data ?? []).map((row) => [row.trade_date as string, row.amd_outcome_tag])
  );
  let cohortTextbook = 0;
  console.log('\n=== 19 hindsight TEXTBOOK+breach → amd_outcome_tag ===');
  for (const csvRow of cohort) {
    const outcomeTag = outcomeByDate.get(csvRow.trade_date) ?? 'null';
    if (outcomeTag === 'AMD_TEXTBOOK') cohortTextbook += 1;
    console.log(`${csvRow.trade_date} → ${outcomeTag}`);
  }
  console.log(
    `Confirmed TEXTBOOK at outcome: ${cohortTextbook}/${cohort.length} (${pct(cohortTextbook, cohort.length)})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
