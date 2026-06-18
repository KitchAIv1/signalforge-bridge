/** Fetch and upsert the latest complete OANDA D1 bar into d1_candles. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  D1_CANDLES_TABLE,
  D1_DIRECTION_THRESHOLD_PIPS,
  D1_PAIR,
} from './d1Constants.js';
import { computeD1ProfileMetrics } from './d1ProfileMetrics.js';
import {
  buildD1Window,
  buildLatestCompleteD1FetchWindow,
} from './d1Window.js';

type OandaD1Candle = {
  time: string;
  complete: boolean;
  mid: { o: string; h: string; l: string; c: string };
};

function parseOandaPrices(candle: OandaD1Candle): {
  o: number;
  h: number;
  l: number;
  c: number;
} {
  return {
    o: parseFloat(candle.mid.o),
    h: parseFloat(candle.mid.h),
    l: parseFloat(candle.mid.l),
    c: parseFloat(candle.mid.c),
  };
}

function pickLatestCompleteCandle(candles: OandaD1Candle[]): OandaD1Candle | null {
  const completeCandles = candles.filter((candle) => candle.complete === true);
  if (completeCandles.length === 0) return null;
  return [...completeCandles].sort((a, b) => b.time.localeCompare(a.time))[0];
}

async function persistD1CandleRow(
  supabase: SupabaseClient,
  tradeDate: string,
  candle: OandaD1Candle,
): Promise<void> {
  const prices = parseOandaPrices(candle);
  const metrics = computeD1ProfileMetrics(
    {
      openPrice: prices.o,
      highPrice: prices.h,
      lowPrice: prices.l,
      closePrice: prices.c,
    },
    D1_DIRECTION_THRESHOLD_PIPS,
  );

  const { error } = await supabase.from(D1_CANDLES_TABLE).upsert(
    {
      trade_date: tradeDate,
      pair: D1_PAIR,
      open_price: prices.o,
      high_price: prices.h,
      low_price: prices.l,
      close_price: prices.c,
      net_pips: metrics.netPips,
      range_pips: metrics.rangePips,
      direction: metrics.direction,
      close_position_pct: metrics.closePositionPct,
      body_pct: metrics.bodyPct,
      upper_wick_pct: metrics.upperWickPct,
      lower_wick_pct: metrics.lowerWickPct,
      candle_time: candle.time,
    },
    { onConflict: 'trade_date,pair' },
  );

  if (error) {
    console.error(`[D1DailyFetch] Upsert failed for ${tradeDate}:`, error.message);
    return;
  }

  console.log(
    `[D1DailyFetch] Stored D1 candle for ${tradeDate}: direction=${metrics.direction} net=${metrics.netPips}p`,
  );
}

/** Cron path: fetch latest complete D1 bar; trade_date derived from candle.time. */
export async function fetchLatestCompleteD1Candle(supabase: SupabaseClient): Promise<void> {
  const { fromISO, toISO } = buildLatestCompleteD1FetchWindow();
  const candles = await fetchCompletedCandles(D1_PAIR, 'D', fromISO, toISO);

  const candle = pickLatestCompleteCandle(candles as OandaD1Candle[]);
  if (!candle) {
    console.log(
      '[D1DailyFetch] No complete D1 candle in fetch window — will retry next scheduled run',
    );
    return;
  }

  const tradeDate = candle.time.slice(0, 10);
  console.log(`[D1DailyFetch] Latest complete candle time=${candle.time} trade_date=${tradeDate}`);
  await persistD1CandleRow(supabase, tradeDate, candle);
}

/** Explicit trade_date path (midnight window) — used by manual callers; cron uses fetchLatestCompleteD1Candle. */
export async function fetchTodayD1Candle(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<void> {
  const { fromISO, toISO } = buildD1Window(tradeDate);
  const candles = await fetchCompletedCandles(D1_PAIR, 'D', fromISO, toISO);

  const candle = pickLatestCompleteCandle(candles as OandaD1Candle[]);
  if (!candle) {
    console.log(
      `[D1DailyFetch] No complete D1 candle yet for ${tradeDate} — will retry next scheduled run`,
    );
    return;
  }

  await persistD1CandleRow(supabase, tradeDate, candle);
}

export async function fetchTodayD1Candles(): Promise<void> {
  await fetchLatestCompleteD1Candle(getSupabaseClient());
}
