// Backfills accumulation_quality_score for all historical amd_state rows
// where the column is NULL but chart_data exists.
// Reads Asian H1 candles from chart_data.ohlc — no OANDA re-fetch.
// Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/backfillAccumulationQualityScore.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { parseH1Candles, groupH1ByUtcHour } from './amdTcBacktest/h1Helpers';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, chart_data, asian_range_pips')
    .is('accumulation_quality_score', null)
    .not('chart_data', 'is', null)
    .order('trade_date', { ascending: true });

  if (error || !data) {
    console.error('Fetch error:', error);
    process.exit(1);
  }

  console.log(`Rows to backfill: ${data.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of data) {
    try {
      const candles = parseH1Candles(row.chart_data?.ohlc ?? []);
      const byHour = groupH1ByUtcHour(candles);

      const asianCandles = [0,1,2,3,4,5,6,7]
        .map(h => byHour.get(h))
        .filter((c): c is NonNullable<typeof c> => c != null);

      if (asianCandles.length < 4) { skipped++; continue; }

      const high = Math.max(...asianCandles.map(c => c.h));
      const low  = Math.min(...asianCandles.map(c => c.l));
      const open  = asianCandles[0].o;
      const close = asianCandles[asianCandles.length - 1].c;

      const rangePips = Math.round((high - low) * 10000);
      if (rangePips === 0) { skipped++; continue; }

      const netPips = Math.round((close - open) * 10000);
      const netToRangeRatio = Math.abs(netPips) / rangePips;
      const score = Math.round((1 - netToRangeRatio) * 100) / 100;

      // Integrity check vs stored range
      const storedRange = row.asian_range_pips ?? 0;
      if (Math.abs(rangePips - storedRange) > 2) {
        console.warn(`WARN: range mismatch on ${row.trade_date} — computed ${rangePips} vs stored ${storedRange}, skipping`);
        skipped++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from('amd_state')
        .update({ accumulation_quality_score: score })
        .eq('trade_date', row.trade_date)
        .eq('pair', 'AUD_USD');

      if (updateErr) {
        console.error(`Update error on ${row.trade_date}:`, updateErr);
        skipped++;
      } else {
        updated++;
      }
    } catch (e) {
      console.error(`Error on ${row.trade_date}:`, e);
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated} | Skipped: ${skipped}`);
}

run();
