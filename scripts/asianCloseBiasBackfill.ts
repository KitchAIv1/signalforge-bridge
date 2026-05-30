/**
 * Asian Close Bias Backfill
 * Reads chart_data from amd_state, computes asian_close_position_pct and
 * asian_close_bias_signal for all historical rows. No OANDA API calls.
 *
 * Run: npm run asian-close-bias-backfill
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  readOhlcFromChart,
  filterCandlesByUtcHours,
  ASIAN_UTC_HOURS,
} from './amdJudasWindow/chartOhlc.js';

function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[AsianCloseBiasBackfill] Missing SUPABASE_URL or service key');
  }
  return createClient(url, key);
}

type BackfillRow = {
  id: string;
  trade_date: string;
  chart_data: Record<string, unknown> | null;
  asian_close_bias_signal: string | null;
};

type Counters = {
  total: number;
  written: number;
  skippedAlreadyPopulated: number;
  skippedNoChartData: number;
  skippedNoHour7: number;
  errors: number;
};

function computeBiasFromChartData(
  chartData: Record<string, unknown> | null,
): { pct: number | null; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null } {
  const entries = readOhlcFromChart(chartData);
  const asianCandles = filterCandlesByUtcHours(entries, ASIAN_UTC_HOURS);
  if (asianCandles.length === 0) return { pct: null, signal: null };

  const hourSeven = asianCandles.find(
    (bar) => new Date(bar.time).getUTCHours() === 7,
  );
  if (!hourSeven) return { pct: null, signal: null };

  const highs = asianCandles.map((bar) => parseFloat(bar.mid.h));
  const lows = asianCandles.map((bar) => parseFloat(bar.mid.l));
  const validHighs = highs.filter(Number.isFinite);
  const validLows = lows.filter(Number.isFinite);
  if (validHighs.length === 0 || validLows.length === 0) {
    return { pct: null, signal: null };
  }

  const high = Math.max(...validHighs);
  const low = Math.min(...validLows);
  const close = parseFloat(hourSeven.mid.c);

  if (!Number.isFinite(close) || high === low) {
    return { pct: null, signal: null };
  }

  const pct = Math.round(((close - low) / (high - low)) * 10000) / 100;
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    pct >= 60 ? 'BULLISH' : pct <= 40 ? 'BEARISH' : 'NEUTRAL';
  return { pct, signal };
}

async function main(): Promise<void> {
  const supabase = buildSupabase();

  const { data: rows, error } = await supabase
    .from('amd_state')
    .select('id, trade_date, chart_data, asian_close_bias_signal')
    .eq('pair', 'AUD_USD')
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`[Backfill] Fetch failed: ${error.message}`);

  const counters: Counters = {
    total: rows?.length ?? 0,
    written: 0,
    skippedAlreadyPopulated: 0,
    skippedNoChartData: 0,
    skippedNoHour7: 0,
    errors: 0,
  };

  for (const row of (rows ?? []) as BackfillRow[]) {
    if (row.asian_close_bias_signal !== null) {
      counters.skippedAlreadyPopulated++;
      continue;
    }
    if (!row.chart_data) {
      counters.skippedNoChartData++;
      continue;
    }

    try {
      const { pct, signal } = computeBiasFromChartData(row.chart_data);
      if (signal === null) {
        counters.skippedNoHour7++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from('amd_state')
        .update({
          asian_close_position_pct: pct,
          asian_close_bias_signal: signal,
        })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`[Backfill] Update error ${row.trade_date}: ${updateErr.message}`);
        counters.errors++;
      } else {
        counters.written++;
        console.log(`  ${row.trade_date} → pct=${pct} signal=${signal}`);
      }
    } catch (err) {
      console.error(`[Backfill] Compute error ${row.trade_date}: ${(err as Error).message}`);
      counters.errors++;
    }
  }

  console.log('\n=== Asian Close Bias Backfill Complete ===');
  console.log(`  Total rows:              ${counters.total}`);
  console.log(`  Written:                 ${counters.written}`);
  console.log(`  Skipped (populated):     ${counters.skippedAlreadyPopulated}`);
  console.log(`  Skipped (no chart_data): ${counters.skippedNoChartData}`);
  console.log(`  Skipped (no hour 7):     ${counters.skippedNoHour7}`);
  console.log(`  Errors:                  ${counters.errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
