/**
 * Audit: TEXTBOOK+breach cohort — live 10:31 tag vs outcome.
 * Run: npx tsx scripts/amdJudasWindow/textbookLiveTagAudit.ts
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { computeDateFeatures } from '../../src/services/amdDetector/amdFeatures.js';
import type { OhlcCandle } from '../../src/services/amdDetector/amdFeatures.js';
import { readOhlcFromChart } from './chartOhlc.js';

dotenv.config();

const PAIR = 'AUD_USD';
const CSV_PATH = 'scripts/output/amd_judas_window_backtest.csv';

function chartToOhlc(chartData: Record<string, unknown> | null): OhlcCandle[] {
  const entries = readOhlcFromChart(chartData);
  return entries.map((entry) => ({
    time: entry.time,
    mid: { o: entry.o, h: entry.h, l: entry.l, c: entry.c },
    complete: true,
  }));
}

function candlesThroughUtcHour(
  candles: OhlcCandle[],
  maxHour: number
): OhlcCandle[] {
  return candles.filter((c) => new Date(c.time).getUTCHours() <= maxHour);
}

function distHoursPresent(candles: OhlcCandle[]): number[] {
  const hours = new Set(candles.map((c) => new Date(c.time).getUTCHours()));
  return [10, 11, 12, 13].filter((h) => hours.has(h));
}

async function main(): Promise<void> {
  const csvLines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  const headers = csvLines[0].split(',');
  const cohortDates = csvLines.slice(1)
    .map((line) => {
      const parts = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = parts[i] ?? '';
      });
      return row;
    })
    .filter(
      (row) =>
        row.judas_current_breach === 'true' &&
        row.is_london_fix_day === 'false' &&
        row.tag_window_current === 'AMD_TEXTBOOK'
    )
    .map((row) => row.trade_date)
    .sort();

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, amd_tag, reversal_confirmed, amd_outcome_tag, ' +
        'reversal_confirmed_outcome, chart_data'
    )
    .eq('pair', PAIR)
    .in('trade_date', cohortDates);
  if (error) throw new Error(error.message);

  const byDate = new Map((data ?? []).map((row) => [row.trade_date as string, row]));

  let reversalNullOrFalse = 0;
  let liveFailed = 0;
  let liveTextbook = 0;
  let storedTextbook = 0;
  let outcomeTextbook = 0;

  console.log('\n=== TEXTBOOK + breach (Group A): live 10:31 simulation (H≤9, no dist) ===\n');
  console.log(
    'date       | stored_tag          | stored_rev | live@H≤9 tag        | live_rev | dist hrs   | outcome_tag         | out_rev'
  );
  console.log('-'.repeat(115));

  for (const tradeDate of cohortDates) {
    const dbRow = byDate.get(tradeDate);
    if (!dbRow) {
      console.log(`${tradeDate} | MISSING`);
      continue;
    }
    const allCandles = chartToOhlc(dbRow.chart_data as Record<string, unknown>);
    const liveCandles = candlesThroughUtcHour(allCandles, 9);
    const liveFeatures = computeDateFeatures(liveCandles, () => {});
    const distH = distHoursPresent(liveCandles);

    const liveRev = liveFeatures.reversal_confirmed;
    if (liveRev === null || liveRev === false) reversalNullOrFalse += 1;
    if (liveFeatures.amd_tag === 'AMD_FAILED') liveFailed += 1;
    if (liveFeatures.amd_tag === 'AMD_TEXTBOOK') liveTextbook += 1;
    if (dbRow.amd_tag === 'AMD_TEXTBOOK') storedTextbook += 1;
    if (dbRow.amd_outcome_tag === 'AMD_TEXTBOOK') outcomeTextbook += 1;

    console.log(
      `${tradeDate} | ${String(dbRow.amd_tag).padEnd(19)} | ` +
        `${String(dbRow.reversal_confirmed).padEnd(10)} | ` +
        `${liveFeatures.amd_tag.padEnd(19)} | ` +
        `${String(liveRev).padEnd(8)} | ` +
        `[${distH.join(',') || 'none'}]`.padEnd(10) + ' | ' +
        `${String(dbRow.amd_outcome_tag ?? 'null').padEnd(19)} | ` +
        `${dbRow.reversal_confirmed_outcome}`
    );
  }

  const n = cohortDates.length;
  const pct = (part: number) =>
    n === 0 ? 'n/a' : `${Math.round((1000 * part) / n) / 10}%`;

  console.log(`\n=== Summary (n=${n}) ===`);
  console.log(
    `Live@H≤9 reversal_confirmed null or false: ${reversalNullOrFalse} (${pct(reversalNullOrFalse)})`
  );
  console.log(`Live@H≤9 amd_tag = AMD_FAILED: ${liveFailed} (${pct(liveFailed)})`);
  console.log(`Live@H≤9 amd_tag = AMD_TEXTBOOK: ${liveTextbook} (${pct(liveTextbook)})`);
  console.log(`Stored amd_tag = AMD_TEXTBOOK (10:31 row): ${storedTextbook}`);
  console.log(`Outcome amd_outcome_tag = AMD_TEXTBOOK: ${outcomeTextbook}`);
}

main().catch((err) => {
  console.error('[TextbookLiveAudit] Fatal:', err);
  process.exitCode = 1;
});
