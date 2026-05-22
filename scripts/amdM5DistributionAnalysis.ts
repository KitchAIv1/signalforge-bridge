/**
 * AMD M5 distribution window price behavior analysis per tag.
 * Run: npx tsx scripts/amdM5DistributionAnalysis.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const PAIR = 'AUD_USD';

// Entry hour per AMD tag — reference price = first M5 bar open at this hour
// Aligns peak measurement with actual trade entry price
// TEXTBOOK/SHIFTED: hour 12 | FAILED: hour 11 | COMPRESSION/NONE: hour 10
const ENTRY_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 12,
  AMD_COMPRESSION_BREAKOUT: 10,
  AMD_FAILED: 11,
  AMD_SHIFTED: 12,
  AMD_NONE: 10,
};

const TAGS_TO_ANALYZE = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;

const TRAIL_DISTANCES = [2.5, 5, 7.5, 10, 12.5, 15];

const DIST_START_HOUR = 10;
const DIST_END_HOUR = 15;

const TOTAL_BARS = 72;

const TAG_SHORT: Record<string, string> = {
  AMD_TEXTBOOK: 'TEXTBOOK',
  AMD_COMPRESSION_BREAKOUT: 'COMPRESSION',
  AMD_FAILED: 'FAILED',
  AMD_SHIFTED: 'SHIFTED',
  AMD_NONE: 'NONE',
};

type AmdTag = (typeof TAGS_TO_ANALYZE)[number];

type M5Candle = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

type AmdStateRow = {
  trade_date: string;
  amd_tag: string;
  judas_direction: string | null;
  judas_extreme_price: number | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  reversal_confirmed: boolean | null;
  asian_range_pips: number | null;
};

type DayData = {
  trade_date: string;
  amd_tag: AmdTag;
  predicted_direction: string;
  reference_price: number;
  reference_type: string;
  judas_extreme_price: number | null;
  h10_open_price: number | null;
  candles: M5Candle[];
};

type DayBarProfile = {
  bar_index: number;
  utc_hour: number;
  utc_minute: number;
  favorable_pips: number;
  adverse_pips: number;
  running_peak_pips: number;
  pullback_from_peak: number;
  is_new_peak: boolean;
  close_pips: number;
  low_from_ref: number;
  favorable_from_judas: number | null;
  favorable_from_h10: number | null;
};

type BarStats = {
  bar_index: number;
  utc_hour: number;
  utc_minute: number;
  n_days: number;
  avg_favorable: number;
  p25_favorable: number;
  p50_favorable: number;
  p75_favorable: number;
  max_favorable: number;
  avg_adverse: number;
  max_adverse: number;
  avg_running_peak: number;
  p75_running_peak: number;
  avg_pullback_from_peak: number;
  pct_still_advancing: number;
  pct_new_peak: number;
  trail_fired_pct: Record<number, number>;
  hard_sl_fired_pct: number;
};

type TrailResult = {
  trail_pips: number;
  fired: boolean;
  fire_bar_index: number | null;
  fire_hour: number | null;
  captured_pips: number | null;
  fired_before_peak: boolean;
  exit_reason: string;
};

type TagAnalysis = {
  tag: string;
  n_days: number;
  reference_type: string;
  avg_peak_pips: number;
  p25_peak_pips: number;
  p50_peak_pips: number;
  p75_peak_pips: number;
  max_peak_pips: number;
  avg_peak_bar_index: number;
  avg_peak_utc_hour: number;
  pct_peak_by_bar: Record<number, number>;
  avg_pips_given_back_after_peak: number;
  avg_bars_to_give_back_half_peak: number;
  trail_analysis: Array<{
    trail_pips: number;
    avg_captured_pips: number;
    pct_of_peak_captured: number;
    pct_fired_before_peak: number;
    pct_fired_after_peak: number;
    avg_fire_bar: number;
    avg_fire_hour: number;
    exit_reasons: {
      trail_stop: number;
      hard_sl: number;
      max_hold: number;
    };
  }>;
  optimal_trail_pips: number;
  optimal_trail_capture_pct: number;
  pct_hard_sl_15pip: number;
  avg_peak_from_judas: number | null;
  avg_peak_from_h10: number | null;
  bar_stats: BarStats[];
  pct_peaked_by_hour: Record<number, number>;
};

function buildSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[M5Backfetch] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function computePredictedDirection(row: AmdStateRow): string {
  const tag = row.amd_tag;
  const judas = row.judas_direction;

  if (tag === 'AMD_TEXTBOOK' || tag === 'AMD_FAILED') {
    if (judas === 'UP') return 'DOWN';
    if (judas === 'DOWN') return 'UP';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judas === 'UP') return 'UP';
    if (judas === 'DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_SHIFTED' || tag === 'AMD_NONE') {
    const alignment = row.daily_bias_alignment;
    if (alignment === 'ALIGNED') {
      if (judas === 'UP') return 'DOWN';
      if (judas === 'DOWN') return 'UP';
      return 'NO_PREDICTION';
    }
    if (alignment === 'CONFLICTED') {
      const d1 = row.layer4_d1_bias;
      if (d1 === 'TRENDING_UP') return 'UP';
      if (d1 === 'TRENDING_DOWN') return 'DOWN';
      return 'NO_PREDICTION';
    }
    return 'NO_PREDICTION';
  }

  return 'NO_PREDICTION';
}

async function loadData(): Promise<DayData[]> {
  const supabase = buildSupabaseClient();

  const { data: amdRows, error: amdErr } = await supabase
    .from('amd_state')
    .select(`
      trade_date,
      amd_tag,
      judas_direction,
      judas_extreme_price,
      daily_bias_alignment,
      layer4_d1_bias,
      reversal_confirmed,
      asian_range_pips
    `)
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (amdErr || !amdRows) {
    throw new Error(`[Analysis] amd_state load failed: ${amdErr?.message}`);
  }

  const { data: m5Rows, error: m5Err } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success');

  if (m5Err || !m5Rows) {
    throw new Error(`[Analysis] M5 candles load failed: ${m5Err?.message}`);
  }

  const m5Map = new Map<string, M5Candle[]>();
  for (const row of m5Rows) {
    m5Map.set(row.trade_date as string, row.candles as M5Candle[]);
  }

  const days: DayData[] = [];
  const skipped = { no_m5: 0, no_prediction: 0, no_ref_price: 0, unknown_tag: 0 };

  for (const amdRow of amdRows as AmdStateRow[]) {
    const tag = amdRow.amd_tag;

    if (!TAGS_TO_ANALYZE.includes(tag as AmdTag)) {
      skipped.unknown_tag++;
      continue;
    }

    const candles = m5Map.get(amdRow.trade_date);
    if (!candles || candles.length === 0) {
      skipped.no_m5++;
      continue;
    }

    const predicted = computePredictedDirection(amdRow);
    if (predicted === 'NO_PREDICTION') {
      skipped.no_prediction++;
      continue;
    }

    const h10Candle = candles.find(
      (candle) =>
        new Date(candle.time).getUTCHours() === 10 &&
        new Date(candle.time).getUTCMinutes() === 0,
    );
    const h10OpenPrice = h10Candle ? parseFloat(h10Candle.o) : null;
    const judasPriceRaw = amdRow.judas_extreme_price;
    const judasPriceNum =
      judasPriceRaw !== null ? parseFloat(String(judasPriceRaw)) : null;

    const entryHour = ENTRY_HOURS[tag];
    if (entryHour === undefined) {
      skipped.unknown_tag++;
      continue;
    }

    const entryCandle = candles.find(
      (candle) => new Date(candle.time).getUTCHours() === entryHour,
    );

    if (!entryCandle) {
      skipped.no_ref_price++;
      continue;
    }

    const referencePrice = parseFloat(entryCandle.o);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      skipped.no_ref_price++;
      continue;
    }

    const referenceType = `entry_h${entryHour}_open`;

    days.push({
      trade_date: amdRow.trade_date,
      amd_tag: tag as AmdTag,
      predicted_direction: predicted,
      reference_price: referencePrice,
      reference_type: referenceType,
      judas_extreme_price: judasPriceNum,
      h10_open_price: h10OpenPrice,
      candles,
    });
  }

  console.log(`[Load] Days loaded: ${days.length}`);
  console.log(`[Load] Skipped — no M5: ${skipped.no_m5}`);
  console.log(`[Load] Skipped — no prediction: ${skipped.no_prediction}`);
  console.log(`[Load] Skipped — no ref price: ${skipped.no_ref_price}`);
  console.log(`[Load] Skipped — unknown tag: ${skipped.unknown_tag}`);
  console.log('');

  return days;
}

function computeDayBarProfiles(day: DayData): DayBarProfile[] {
  const profiles: DayBarProfile[] = [];
  let runningPeak = 0;
  let barIndex = 0;

  const distCandles = day.candles.filter((candle) => {
    const hourUtc = new Date(candle.time).getUTCHours();
    return hourUtc >= DIST_START_HOUR && hourUtc <= DIST_END_HOUR;
  });

  for (const candle of distCandles) {
    const candleTime = new Date(candle.time);
    const utcHour = candleTime.getUTCHours();
    const utcMinute = candleTime.getUTCMinutes();
    const high = parseFloat(candle.h);
    const low = parseFloat(candle.l);
    const close = parseFloat(candle.c);
    const refPrice = day.reference_price;
    const dir = day.predicted_direction;

    const favorable =
      dir === 'UP' ? (high - refPrice) * 10000 : (refPrice - low) * 10000;

    const adverse =
      dir === 'UP' ? (refPrice - low) * 10000 : (high - refPrice) * 10000;

    const closePips =
      dir === 'UP' ? (close - refPrice) * 10000 : (refPrice - close) * 10000;

    const lowFromRef =
      dir === 'UP' ? (low - refPrice) * 10000 : (refPrice - high) * 10000;

    const isNewPeak = favorable > runningPeak;
    if (isNewPeak) runningPeak = favorable;

    const pullback = Math.max(0, runningPeak - favorable);

    let favorableFromJudas: number | null = null;
    let favorableFromH10: number | null = null;

    if (day.judas_extreme_price !== null) {
      favorableFromJudas =
        dir === 'UP'
          ? (high - day.judas_extreme_price) * 10000
          : (day.judas_extreme_price - low) * 10000;
    }
    if (day.h10_open_price !== null) {
      favorableFromH10 =
        dir === 'UP'
          ? (high - day.h10_open_price) * 10000
          : (day.h10_open_price - low) * 10000;
    }

    profiles.push({
      bar_index: barIndex,
      utc_hour: utcHour,
      utc_minute: utcMinute,
      favorable_pips: parseFloat(favorable.toFixed(2)),
      adverse_pips: parseFloat(adverse.toFixed(2)),
      running_peak_pips: parseFloat(runningPeak.toFixed(2)),
      pullback_from_peak: parseFloat(pullback.toFixed(2)),
      is_new_peak: isNewPeak,
      close_pips: parseFloat(closePips.toFixed(2)),
      low_from_ref: parseFloat(lowFromRef.toFixed(2)),
      favorable_from_judas:
        favorableFromJudas !== null ? parseFloat(favorableFromJudas.toFixed(2)) : null,
      favorable_from_h10:
        favorableFromH10 !== null ? parseFloat(favorableFromH10.toFixed(2)) : null,
    });

    barIndex++;
  }

  return profiles;
}

function simulateTrailForDay(
  profiles: DayBarProfile[],
  trailPips: number,
  hardSlPips: number,
): TrailResult {
  let peakPips = 0;
  let peakBarIndex = -1;
  for (const profile of profiles) {
    if (profile.favorable_pips > peakPips) {
      peakPips = profile.favorable_pips;
      peakBarIndex = profile.bar_index;
    }
  }

  let runningPeak = 0;

  for (const profile of profiles) {
    if (profile.favorable_pips > runningPeak) {
      runningPeak = profile.favorable_pips;
    }

    if (profile.low_from_ref <= -hardSlPips) {
      return {
        trail_pips: trailPips,
        fired: true,
        fire_bar_index: profile.bar_index,
        fire_hour: profile.utc_hour,
        captured_pips: -hardSlPips,
        fired_before_peak: profile.bar_index < peakBarIndex,
        exit_reason: 'hard_sl',
      };
    }

    if (runningPeak >= trailPips && profile.low_from_ref <= runningPeak - trailPips) {
      const capturedPips = runningPeak - trailPips;
      return {
        trail_pips: trailPips,
        fired: true,
        fire_bar_index: profile.bar_index,
        fire_hour: profile.utc_hour,
        captured_pips: parseFloat(capturedPips.toFixed(2)),
        fired_before_peak: profile.bar_index < peakBarIndex,
        exit_reason: 'trail_stop',
      };
    }
  }

  const lastProfile = profiles[profiles.length - 1];
  return {
    trail_pips: trailPips,
    fired: false,
    fire_bar_index: null,
    fire_hour: null,
    captured_pips: lastProfile ? lastProfile.close_pips : null,
    fired_before_peak: false,
    exit_reason: 'max_hold',
  };
}

function percentile(sorted: number[], pct: number): number {
  return sorted[Math.floor(sorted.length * pct)];
}

function computeTrailFiredPctByBar(
  allProfiles: Array<{ bars: DayBarProfile[] }>,
  barIndex: number,
  trailDistance: number,
  nDays: number,
): number {
  let firedCount = 0;
  for (const { bars } of allProfiles) {
    const barsUpTo = bars.filter((bar) => bar.bar_index <= barIndex);
    let runPeak = 0;
    for (const bar of barsUpTo) {
      if (bar.favorable_pips > runPeak) runPeak = bar.favorable_pips;
      if (runPeak > 0 && bar.pullback_from_peak >= trailDistance) {
        firedCount++;
        break;
      }
    }
  }
  return parseFloat(((firedCount / nDays) * 100).toFixed(1));
}

function computeHalfPeakGiveBackBars(bars: DayBarProfile[]): number {
  const peakBar = bars.reduce(
    (best, bar) => (bar.favorable_pips > best.favorable_pips ? bar : best),
    bars[0],
  );
  const halfPeak = peakBar.favorable_pips / 2;
  const barsAfterPeak = bars.filter((bar) => bar.bar_index > peakBar.bar_index);
  for (const bar of barsAfterPeak) {
    if (bar.favorable_pips <= halfPeak) {
      return bar.bar_index - peakBar.bar_index;
    }
  }
  return 0;
}

function buildBarStats(
  allProfiles: Array<{ bars: DayBarProfile[] }>,
): BarStats[] {
  const barStats: BarStats[] = [];

  for (let barIndex = 0; barIndex < TOTAL_BARS; barIndex++) {
    const barsAtIndex = allProfiles
      .map(({ bars }) => bars.find((bar) => bar.bar_index === barIndex))
      .filter((bar): bar is DayBarProfile => bar !== undefined);

    if (barsAtIndex.length === 0) continue;

    const n = barsAtIndex.length;
    const favs = barsAtIndex.map((bar) => bar.favorable_pips).sort((a, b) => a - b);
    const advs = barsAtIndex.map((bar) => bar.adverse_pips);
    const peaks = barsAtIndex.map((bar) => bar.running_peak_pips).sort((a, b) => a - b);
    const pullbacks = barsAtIndex.map((bar) => bar.pullback_from_peak);

    const prevBars =
      barIndex > 0
        ? allProfiles
            .map(({ bars }) => bars.find((bar) => bar.bar_index === barIndex - 1))
            .filter((bar): bar is DayBarProfile => bar !== undefined)
        : [];

    let stillAdvancingCount = 0;
    if (barIndex > 0 && prevBars.length > 0) {
      for (let i = 0; i < barsAtIndex.length; i++) {
        const prevBar = prevBars[i];
        if (prevBar && barsAtIndex[i].favorable_pips > prevBar.favorable_pips) {
          stillAdvancingCount++;
        }
      }
    }

    const trailFiredPct: Record<number, number> = {};
    for (const trailDistance of TRAIL_DISTANCES) {
      trailFiredPct[trailDistance] = computeTrailFiredPctByBar(
        allProfiles,
        barIndex,
        trailDistance,
        n,
      );
    }

    const hardSlFired = barsAtIndex.filter((bar) => bar.adverse_pips >= 15).length;

    barStats.push({
      bar_index: barIndex,
      utc_hour: barsAtIndex[0].utc_hour,
      utc_minute: barsAtIndex[0].utc_minute,
      n_days: n,
      avg_favorable: parseFloat((favs.reduce((sum, value) => sum + value, 0) / n).toFixed(2)),
      p25_favorable: percentile(favs, 0.25),
      p50_favorable: percentile(favs, 0.5),
      p75_favorable: percentile(favs, 0.75),
      max_favorable: favs[n - 1],
      avg_adverse: parseFloat((advs.reduce((sum, value) => sum + value, 0) / n).toFixed(2)),
      max_adverse: Math.max(...advs),
      avg_running_peak: parseFloat((peaks.reduce((sum, value) => sum + value, 0) / n).toFixed(2)),
      p75_running_peak: percentile(peaks, 0.75),
      avg_pullback_from_peak: parseFloat(
        (pullbacks.reduce((sum, value) => sum + value, 0) / n).toFixed(2),
      ),
      pct_still_advancing:
        barIndex > 0
          ? parseFloat(((stillAdvancingCount / n) * 100).toFixed(1))
          : 100,
      pct_new_peak: parseFloat(
        ((barsAtIndex.filter((bar) => bar.is_new_peak).length / n) * 100).toFixed(1),
      ),
      trail_fired_pct: trailFiredPct,
      hard_sl_fired_pct: parseFloat(((hardSlFired / n) * 100).toFixed(1)),
    });
  }

  return barStats;
}

function analyzeTag(tag: AmdTag, days: DayData[]): TagAnalysis {
  const tagDays = days.filter((day) => day.amd_tag === tag);
  if (tagDays.length === 0) {
    throw new Error(`[Analysis] No days for tag ${tag}`);
  }

  const allProfiles = tagDays.map((day) => ({
    day,
    bars: computeDayBarProfiles(day),
  }));

  const dayPeaks = allProfiles.map(({ day, bars }) => {
    const peak = bars.reduce(
      (max, bar) =>
        bar.favorable_pips > max.pips
          ? { pips: bar.favorable_pips, bar: bar.bar_index, hour: bar.utc_hour }
          : max,
      { pips: 0, bar: 0, hour: 10 },
    );
    return {
      trade_date: day.trade_date,
      peak_pips: peak.pips,
      peak_bar: peak.bar,
      peak_hour: peak.hour,
    };
  });

  const peakPips = dayPeaks.map((dayPeak) => dayPeak.peak_pips).sort((a, b) => a - b);
  const avgPeak = peakPips.reduce((sum, value) => sum + value, 0) / peakPips.length;
  const p25Peak = percentile(peakPips, 0.25);
  const p50Peak = percentile(peakPips, 0.5);
  const p75Peak = percentile(peakPips, 0.75);
  const maxPeak = peakPips[peakPips.length - 1];
  const avgPeakBar = dayPeaks.reduce((sum, dayPeak) => sum + dayPeak.peak_bar, 0) / dayPeaks.length;
  const avgPeakHr = dayPeaks.reduce((sum, dayPeak) => sum + dayPeak.peak_hour, 0) / dayPeaks.length;

  const pctPeakByBar: Record<number, number> = {};
  for (let barIndex = 0; barIndex < TOTAL_BARS; barIndex++) {
    const pct =
      (dayPeaks.filter((dayPeak) => dayPeak.peak_bar <= barIndex).length / dayPeaks.length) *
      100;
    pctPeakByBar[barIndex] = parseFloat(pct.toFixed(1));
  }

  const pctPeakedByHour: Record<number, number> = {};
  for (const hour of [11, 12, 13, 14]) {
    pctPeakedByHour[hour] = parseFloat(
      (
        (dayPeaks.filter((dayPeak) => dayPeak.peak_hour <= hour).length / dayPeaks.length) *
        100
      ).toFixed(1),
    );
  }

  const barStats = buildBarStats(allProfiles);

  const trailAnalysis = TRAIL_DISTANCES.map((trailDistance) => {
    const results = allProfiles.map(({ bars }) => simulateTrailForDay(bars, trailDistance, 15));
    const fired = results.filter((result) => result.fired);
    const captured = results
      .map((result) => result.captured_pips ?? 0)
      .filter((value) => Number.isFinite(value));
    const avgCaptured =
      captured.length > 0 ? captured.reduce((sum, value) => sum + value, 0) / captured.length : 0;
    const pctOfPeak = avgPeak > 0 ? (avgCaptured / avgPeak) * 100 : 0;
    const firedBeforePeak = fired.filter((result) => result.fired_before_peak).length;
    const firedAfterPeak = fired.filter((result) => !result.fired_before_peak).length;
    const avgFireBar =
      fired.length > 0
        ? fired.reduce((sum, result) => sum + (result.fire_bar_index ?? 0), 0) / fired.length
        : 0;
    const avgFireHour =
      fired.length > 0
        ? fired.reduce((sum, result) => sum + (result.fire_hour ?? 10), 0) / fired.length
        : 0;
    const resultCount = results.length;

    return {
      trail_pips: trailDistance,
      avg_captured_pips: parseFloat(avgCaptured.toFixed(2)),
      pct_of_peak_captured: parseFloat(pctOfPeak.toFixed(1)),
      pct_fired_before_peak: parseFloat(((firedBeforePeak / resultCount) * 100).toFixed(1)),
      pct_fired_after_peak: parseFloat(((firedAfterPeak / resultCount) * 100).toFixed(1)),
      avg_fire_bar: parseFloat(avgFireBar.toFixed(1)),
      avg_fire_hour: parseFloat(avgFireHour.toFixed(1)),
      exit_reasons: {
        trail_stop: parseFloat(
          ((results.filter((result) => result.exit_reason === 'trail_stop').length / resultCount) *
            100).toFixed(1),
        ),
        hard_sl: parseFloat(
          ((results.filter((result) => result.exit_reason === 'hard_sl').length / resultCount) *
            100).toFixed(1),
        ),
        max_hold: parseFloat(
          ((results.filter((result) => result.exit_reason === 'max_hold').length / resultCount) *
            100).toFixed(1),
        ),
      },
    };
  });

  const optimal = trailAnalysis.sort((a, b) => b.avg_captured_pips - a.avg_captured_pips)[0];

  const hardSlDays = allProfiles.filter(({ bars }) =>
    bars.some((bar) => bar.adverse_pips >= 15),
  ).length;

  const judasPeaks = allProfiles
    .map(({ bars }) => {
      const maxJudas = Math.max(...bars.map((bar) => bar.favorable_from_judas ?? -Infinity));
      return Number.isFinite(maxJudas) ? maxJudas : null;
    })
    .filter((value): value is number => value !== null);

  const h10Peaks = allProfiles
    .map(({ bars }) => {
      const maxH10 = Math.max(...bars.map((bar) => bar.favorable_from_h10 ?? -Infinity));
      return Number.isFinite(maxH10) ? maxH10 : null;
    })
    .filter((value): value is number => value !== null);

  const degradation = allProfiles.map(({ bars }) => {
    const peakBar = bars.reduce(
      (best, bar) => (bar.favorable_pips > best.favorable_pips ? bar : best),
      bars[0],
    );
    const barsAfterPeak = bars.filter((bar) => bar.bar_index > peakBar.bar_index);
    if (barsAfterPeak.length === 0) return 0;
    const lastBar = barsAfterPeak[barsAfterPeak.length - 1];
    return Math.max(0, peakBar.favorable_pips - lastBar.favorable_pips);
  });

  const avgGivenBack = degradation.reduce((sum, value) => sum + value, 0) / degradation.length;

  const halfPeakBars = allProfiles
    .map(({ bars }) => computeHalfPeakGiveBackBars(bars))
    .filter((value) => value > 0);
  const avgHalfPeakBars =
    halfPeakBars.length > 0
      ? halfPeakBars.reduce((sum, value) => sum + value, 0) / halfPeakBars.length
      : 0;

  return {
    tag,
    n_days: tagDays.length,
    reference_type: tagDays[0].reference_type,
    avg_peak_pips: parseFloat(avgPeak.toFixed(2)),
    p25_peak_pips: parseFloat(p25Peak.toFixed(2)),
    p50_peak_pips: parseFloat(p50Peak.toFixed(2)),
    p75_peak_pips: parseFloat(p75Peak.toFixed(2)),
    max_peak_pips: parseFloat(maxPeak.toFixed(2)),
    avg_peak_bar_index: parseFloat(avgPeakBar.toFixed(1)),
    avg_peak_utc_hour: parseFloat(avgPeakHr.toFixed(1)),
    pct_peak_by_bar: pctPeakByBar,
    avg_pips_given_back_after_peak: parseFloat(avgGivenBack.toFixed(2)),
    avg_bars_to_give_back_half_peak: parseFloat(avgHalfPeakBars.toFixed(1)),
    trail_analysis: trailAnalysis,
    optimal_trail_pips: optimal.trail_pips,
    optimal_trail_capture_pct: optimal.pct_of_peak_captured,
    pct_hard_sl_15pip: parseFloat(((hardSlDays / tagDays.length) * 100).toFixed(1)),
    avg_peak_from_judas:
      judasPeaks.length > 0
        ? parseFloat((judasPeaks.reduce((sum, value) => sum + value, 0) / judasPeaks.length).toFixed(2))
        : null,
    avg_peak_from_h10:
      h10Peaks.length > 0
        ? parseFloat((h10Peaks.reduce((sum, value) => sum + value, 0) / h10Peaks.length).toFixed(2))
        : null,
    bar_stats: barStats,
    pct_peaked_by_hour: pctPeakedByHour,
  };
}

function printPeakCharacteristics(analyses: TagAnalysis[]): void {
  console.log('--- Peak Characteristics Per Tag ---\n');
  for (const analysis of analyses) {
    console.log(
      `${analysis.tag} (n=${analysis.n_days} | ref=${analysis.reference_type}):`,
    );
    console.log(
      `  Peak pips:  avg=${analysis.avg_peak_pips.toFixed(1)} | p25=${analysis.p25_peak_pips.toFixed(1)} | p50=${analysis.p50_peak_pips.toFixed(1)} | p75=${analysis.p75_peak_pips.toFixed(1)} | max=${analysis.max_peak_pips.toFixed(1)}`,
    );
    console.log(
      `  Peak timing: avg bar=${analysis.avg_peak_bar_index.toFixed(0)} (avg hour=${analysis.avg_peak_utc_hour.toFixed(1)} UTC)`,
    );
    console.log(
      `  % peaked by hour 11: ${analysis.pct_peaked_by_hour[11]}% | by hour 12: ${analysis.pct_peaked_by_hour[12]}% | by hour 13: ${analysis.pct_peaked_by_hour[13]}% | by hour 14: ${analysis.pct_peaked_by_hour[14]}%`,
    );
    console.log(
      `  Degradation: avg ${analysis.avg_pips_given_back_after_peak.toFixed(1)} pips given back after peak`,
    );
    console.log(`  Hard SL (15p adverse) hit: ${analysis.pct_hard_sl_15pip.toFixed(0)}% of days\n`);
  }
}

function printTrailAnalysis(analyses: TagAnalysis[]): void {
  console.log('--- Trail Distance Analysis Per Tag ---\n');
  for (const analysis of analyses) {
    console.log(`${analysis.tag}:`);
    console.log(
      '  Trail | AvgCapture | %ofPeak | FiredBeforePeak | FiredAfterPeak | AvgFireHour',
    );
    for (const trail of analysis.trail_analysis) {
      console.log(
        `  ${trail.trail_pips.toFixed(1).padEnd(4)}p | ${trail.avg_captured_pips.toFixed(1).padStart(6)}p | ${String(trail.pct_of_peak_captured.toFixed(0)).padStart(4)}% | ${String(trail.pct_fired_before_peak.toFixed(0)).padStart(15)}% | ${String(trail.pct_fired_after_peak.toFixed(0)).padStart(14)}% | ${trail.avg_fire_hour.toFixed(1)}`,
      );
    }
    const optimal = analysis.trail_analysis.find(
      (trail) => trail.trail_pips === analysis.optimal_trail_pips,
    );
    if (optimal) {
      console.log(
        `  ⭐ OPTIMAL: ${analysis.optimal_trail_pips}p trail — captures ${optimal.avg_captured_pips.toFixed(1)}p avg (${optimal.pct_of_peak_captured.toFixed(0)}% of peak) | before_peak=${optimal.pct_fired_before_peak.toFixed(0)}% | hard_sl=${optimal.exit_reasons.hard_sl.toFixed(0)}% | trail=${optimal.exit_reasons.trail_stop.toFixed(0)}% | hold=${optimal.exit_reasons.max_hold.toFixed(0)}%`,
      );
    }
    console.log('');
  }
}

function printStillAdvancingTable(analyses: TagAnalysis[]): void {
  console.log('--- Still Advancing % Per Hour (key bars only) ---');
  console.log('Bar at start of each UTC hour:');
  const header =
    'Hour | Bar# | ' +
    TAGS_TO_ANALYZE.map((tag) => TAG_SHORT[tag].padEnd(11)).join(' | ');
  console.log(header);

  const hourBarMap = [
    { hour: 10, bar: 0 },
    { hour: 11, bar: 12 },
    { hour: 12, bar: 24 },
    { hour: 13, bar: 36 },
    { hour: 14, bar: 48 },
    { hour: 15, bar: 60 },
  ];

  for (const { hour, bar } of hourBarMap) {
    const cells = analyses.map((analysis) => {
      const barStat = analysis.bar_stats.find((stat) => stat.bar_index === bar);
      const pct = barStat ? `${barStat.pct_still_advancing.toFixed(0)}%` : 'n/a';
      return pct.padEnd(11);
    });
    console.log(
      `${String(hour).padEnd(4)} | ${String(bar).padStart(4)} | ${cells.join(' | ')}`,
    );
  }
  console.log('');
}

function printSummary(analyses: TagAnalysis[]): void {
  const totalDays = analyses.reduce((sum, analysis) => sum + analysis.n_days, 0);

  console.log('=== AMD M5 DISTRIBUTION ANALYSIS ===');
  console.log(`Days analyzed: ${totalDays} | Resolution: M5 intrabar H/L`);
  console.log(
    'Reference: entry-hour M5 open per tag (TEXTBOOK/SHIFTED=hr12, FAILED=hr11, COMPRESSION/NONE=hr10)\n',
  );

  printPeakCharacteristics(analyses);
  printTrailAnalysis(analyses);
  printStillAdvancingTable(analyses);

  console.log('--- Secondary Reference Comparison (SHIFTED & NONE) ---');
  for (const tag of ['AMD_SHIFTED', 'AMD_NONE'] as const) {
    const analysis = analyses.find((entry) => entry.tag === tag);
    if (!analysis) continue;
    console.log(
      `${tag}: avg peak from judas_extreme=${analysis.avg_peak_from_judas?.toFixed(1) ?? 'n/a'}p | from h10_open=${analysis.avg_peak_from_h10?.toFixed(1) ?? 'n/a'}p`,
    );
  }

  console.log('\n--- Trail Stop Recommendation Per Tag ---');
  for (const analysis of analyses) {
    console.log(
      `${analysis.tag.padEnd(26)} Optimal trail = ${analysis.optimal_trail_pips}p | Captures ${analysis.optimal_trail_capture_pct.toFixed(0)}% of ${analysis.avg_peak_pips.toFixed(1)} avg peak`,
    );
  }
}

function trailColumnName(trailPips: number): string {
  return `trail_fired_pct_${String(trailPips).replace('.', '_')}`;
}

function writeCsvs(analyses: TagAnalysis[]): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const barPath = path.join(outDir, 'amd_m5_bar_analysis.csv');
  const trailPath = path.join(outDir, 'amd_m5_trail_analysis.csv');

  const barHeader = [
    'amd_tag',
    'bar_index',
    'utc_hour',
    'utc_minute',
    'n_days',
    'avg_favorable',
    'p25_favorable',
    'p50_favorable',
    'p75_favorable',
    'max_favorable',
    'avg_adverse',
    'avg_running_peak',
    'p75_running_peak',
    'avg_pullback_from_peak',
    'pct_still_advancing',
    'pct_new_peak',
    'hard_sl_fired_pct',
    ...TRAIL_DISTANCES.map(trailColumnName),
  ].join(',');

  const barLines = [barHeader];
  for (const analysis of analyses) {
    for (const barStat of analysis.bar_stats) {
      barLines.push(
        [
          analysis.tag,
          barStat.bar_index,
          barStat.utc_hour,
          barStat.utc_minute,
          barStat.n_days,
          barStat.avg_favorable,
          barStat.p25_favorable,
          barStat.p50_favorable,
          barStat.p75_favorable,
          barStat.max_favorable,
          barStat.avg_adverse,
          barStat.avg_running_peak,
          barStat.p75_running_peak,
          barStat.avg_pullback_from_peak,
          barStat.pct_still_advancing,
          barStat.pct_new_peak,
          barStat.hard_sl_fired_pct,
          ...TRAIL_DISTANCES.map((trailDistance) => barStat.trail_fired_pct[trailDistance]),
        ].join(','),
      );
    }
  }
  fs.writeFileSync(barPath, barLines.join('\n'), 'utf8');

  const trailHeader =
    'amd_tag,trail_pips,avg_captured_pips,pct_of_peak_captured,pct_fired_before_peak,pct_fired_after_peak,avg_fire_bar,avg_fire_hour';
  const trailLines = [trailHeader];
  for (const analysis of analyses) {
    for (const trail of analysis.trail_analysis) {
      trailLines.push(
        [
          analysis.tag,
          trail.trail_pips,
          trail.avg_captured_pips,
          trail.pct_of_peak_captured,
          trail.pct_fired_before_peak,
          trail.pct_fired_after_peak,
          trail.avg_fire_bar,
          trail.avg_fire_hour,
        ].join(','),
      );
    }
  }
  fs.writeFileSync(trailPath, trailLines.join('\n'), 'utf8');

  console.log(`\n[M5Analysis] CSV written: ${barPath}`);
  console.log(`[M5Analysis] CSV written: ${trailPath}`);
}

async function main(): Promise<void> {
  console.log('[M5Analysis] Starting...');
  const days = await loadData();

  if (days.length === 0) {
    throw new Error('[M5Analysis] No days loaded.');
  }

  const analyses: TagAnalysis[] = [];
  for (const tag of TAGS_TO_ANALYZE) {
    const tagDays = days.filter((day) => day.amd_tag === tag);
    if (tagDays.length === 0) {
      console.log(`[M5Analysis] No days for ${tag} — skipping`);
      continue;
    }
    console.log(`[M5Analysis] Analyzing ${tag} (${tagDays.length} days)...`);
    analyses.push(analyzeTag(tag, days));
  }

  printSummary(analyses);
  writeCsvs(analyses);

  console.log('\n[M5Analysis] Done.');
}

main().catch((err) => {
  console.error('[M5Analysis] Fatal:', err);
  process.exit(1);
});
