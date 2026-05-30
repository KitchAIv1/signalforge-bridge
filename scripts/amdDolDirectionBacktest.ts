import * as dotenv from 'dotenv';
import { writeDolCsv } from './amdDol/csvExport.js';
import { computeDolMetrics } from './amdDol/dolMetrics.js';
import { buildSupabase, loadJoinedCohort, maybeFetchMay29M5 } from './amdDol/loadData.js';
import { printDolSummary } from './amdDol/dolSummary.js';
import {
  fetchDailyCandlesForDate,
  fetchOandaLevelsForDate,
  printNearbyDailyCandles,
} from './amdDol/oandaFetches.js';
import {
  computeAsianMetrics,
  computePredictions,
  computeTopDownSignals,
} from './amdDol/signalCompute.js';
import type {
  AmdDolJoinedRow,
  DailyCloseDirection,
  DolBacktestRow,
  OandaCandle,
} from './amdDol/types.js';

dotenv.config();

const SANITY_EXPECTATIONS: Array<{ tradeDate: string; expected: DailyCloseDirection }> = [
  { tradeDate: '2026-05-19', expected: 'SHORT' },
  { tradeDate: '2026-05-20', expected: 'LONG' },
  { tradeDate: '2026-05-28', expected: 'LONG' },
];

const RUN_SANITY_ONLY = process.argv.includes('--sanity');

async function main(): Promise<void> {
  const supabaseDb = buildSupabase();
  const { rows: loadedRows, stats } = await loadJoinedCohort(supabaseDb);
  logLoadStats(stats);

  const sanityRows = filterDates(loadedRows, SANITY_EXPECTATIONS.map((entry) => entry.tradeDate));
  const dailyCache = await fetchSanityDailyCandles();
  const sanityPassed = await runSanityGate(sanityRows, dailyCache);
  if (!sanityPassed) return;
  if (RUN_SANITY_ONLY) return;

  const m5Overrides = await maybeFetchMay29M5(supabaseDb);
  const { rows: fullRows } = await loadJoinedCohort(supabaseDb, m5Overrides);
  const computedRows = await buildRows(fullRows, dailyCache);
  const csvPath = writeDolCsv(computedRows);
  printDolSummary(computedRows);
  console.log(`\n[Dol] CSV: ${csvPath}`);
  console.log(`FULL RUN COMPLETE: ${computedRows.length} days processed`);
}

async function runSanityGate(
  loadedRows: AmdDolJoinedRow[],
  dailyCache: Map<string, OandaCandle[]>
): Promise<boolean> {
  console.log('\n[Dol] daily alignment rule locked: open-date-plus-one');
  const computedRows = await buildRows(loadedRows, dailyCache);
  printSanityRows(computedRows);
  return evaluateSanityGate(computedRows);
}

async function buildRows(
  loadedRows: AmdDolJoinedRow[],
  dailyCache: Map<string, OandaCandle[]>
): Promise<DolBacktestRow[]> {
  const computedRows: DolBacktestRow[] = [];
  for (const loadedRow of loadedRows) {
    computedRows.push(await buildBacktestRow(loadedRow, dailyCache));
  }
  return computedRows;
}

async function buildBacktestRow(
  loadedRow: AmdDolJoinedRow,
  dailyCache: Map<string, OandaCandle[]>
): Promise<DolBacktestRow> {
  const dailyCandles = dailyCache.get(loadedRow.trade_date);
  const levels = await fetchOandaLevelsForDate(loadedRow.trade_date, dailyCandles);
  const asian = computeAsianMetrics(loadedRow.chart_data, loadedRow.trade_date);
  const topDown = computeTopDownSignals(asian, levels, loadedRow);
  const predictions = computePredictions(loadedRow);
  const metrics = computeDolMetrics(loadedRow, predictions, levels);

  return {
    trade_date: loadedRow.trade_date,
    amd_tag: loadedRow.amd_tag,
    daily_bias_alignment: loadedRow.daily_bias_alignment,
    layer4_d1_bias: loadedRow.layer4_d1_bias,
    layer4_bullish_count: loadedRow.layer4_bullish_count,
    layer4_bearish_count: loadedRow.layer4_bearish_count,
    layer4_d1_bias_7: loadedRow.layer4_d1_bias_7,
    layer4_bullish_count_7: loadedRow.layer4_bullish_count_7,
    layer4_bearish_count_7: loadedRow.layer4_bearish_count_7,
    m5_vs_judas_direction: loadedRow.m5_vs_judas_direction,
    judas_direction: loadedRow.judas_direction,
    judas_pips: loadedRow.judas_pips,
    judas_extreme_price: loadedRow.judas_extreme_price,
    asian_range_pips: loadedRow.asian_range_pips,
    asian_is_flat: loadedRow.asian_is_flat,
    asian_high: asian.asianHigh,
    asian_low: asian.asianLow,
    asian_open: asian.asianOpen,
    asian_close: asian.asianClose,
    asian_close_position_pct: asian.asianClosePositionPct,
    asian_close_bias: asian.asianCloseBias,
    prev_day_high: levels.prevDayHigh,
    prev_day_low: levels.prevDayLow,
    prev_day_close: levels.prevDayClose,
    prev_week_high: levels.prevWeekHigh,
    prev_week_low: levels.prevWeekLow,
    weekly_open: levels.weeklyOpen,
    monthly_open: levels.monthlyOpen,
    weekly_open_bias_computed: topDown.weeklyOpenBias,
    monthly_open_bias_computed: topDown.monthlyOpenBias,
    prev_day_position: topDown.prevDayPosition,
    asian_swept_prev_low: topDown.asianSweptPrevLow,
    asian_swept_prev_high: topDown.asianSweptPrevHigh,
    judas_swept_prev_low: topDown.judasSweptPrevLow,
    judas_swept_prev_high: topDown.judasSweptPrevHigh,
    prior_d1_direction: loadedRow.cleanTrend?.prior_d1_direction ?? null,
    prior_d1_body_pips: loadedRow.cleanTrend?.prior_d1_body_pips ?? null,
    asian_clean_trend_matched: loadedRow.cleanTrend != null,
    weekly_monthly_source: levels.weeklyMonthlySource,
    predicted_judas_inversion_raw: predictions.predictedJudasInversionRaw,
    predicted_auto_direction: predictions.predictedAutoDirection,
    predicted_production: predictions.predictedProduction,
    ...metrics,
  };
}

async function fetchSanityDailyCandles(): Promise<Map<string, OandaCandle[]>> {
  const dailyCache = new Map<string, OandaCandle[]>();
  for (const expectation of SANITY_EXPECTATIONS) {
    const candles = await fetchDailyCandlesForDate(expectation.tradeDate);
    dailyCache.set(expectation.tradeDate, candles);
    printNearbyDailyCandles(expectation.tradeDate, candles);
    await delay(200);
  }
  return dailyCache;
}

function printSanityRows(rows: DolBacktestRow[]): void {
  console.log('\n=== AMD DOL SANITY OUTPUT ===');
  for (const expectation of SANITY_EXPECTATIONS) {
    const row = rows.find((entry) => entry.trade_date === expectation.tradeDate);
    console.log(`\n--- ${expectation.tradeDate} expected_daily_close=${expectation.expected} ---`);
    if (!row) {
      console.log('NOT IN COHORT');
      continue;
    }
    console.log(JSON.stringify(pickSanityFields(row), null, 2));
  }
}

function pickSanityFields(row: DolBacktestRow): Record<string, unknown> {
  return {
    trade_date: row.trade_date,
    amd_tag: row.amd_tag,
    daily_candle_time_raw: row.daily_candle_time_raw,
    daily_open: row.daily_open,
    daily_close: row.daily_close,
    daily_close_direction: row.daily_close_direction,
    distribution_net_direction: row.distribution_net_direction,
    judas_direction: row.judas_direction,
    judas_pips: row.judas_pips,
    predicted_judas_inversion_raw: row.predicted_judas_inversion_raw,
    predicted_production: row.predicted_production,
    predicted_auto_direction: row.predicted_auto_direction,
    prev_day_high: row.prev_day_high,
    prev_day_low: row.prev_day_low,
    entry_price: row.entry_price,
    dol_already_passed: row.dol_already_passed,
    dol_reached: row.dol_reached,
    weekly_open: row.weekly_open,
    monthly_open: row.monthly_open,
    weekly_open_bias_computed: row.weekly_open_bias_computed,
    monthly_open_bias_computed: row.monthly_open_bias_computed,
    asian_swept_prev_low: row.asian_swept_prev_low,
    judas_swept_prev_low: row.judas_swept_prev_low,
    peak_favorable_pips: row.peak_favorable_pips,
    daily_close_matches_production: row.daily_close_matches_production,
  };
}

function evaluateSanityGate(rows: DolBacktestRow[]): boolean {
  let allPassed = true;
  for (const expectation of SANITY_EXPECTATIONS) {
    const row = rows.find((entry) => entry.trade_date === expectation.tradeDate);
    if (!row) {
      console.log(`SANITY FAILED: ${expectation.tradeDate} row not in cohort`);
      allPassed = false;
      continue;
    }
    if (row.daily_close_direction !== expectation.expected) {
      console.log(
        `SANITY FAILED: ${expectation.tradeDate} expected ${expectation.expected} got ${row.daily_close_direction}`
      );
      allPassed = false;
      continue;
    }
    if (
      row.distribution_net_direction != null &&
      row.distribution_net_direction !== row.daily_close_direction
    ) {
      console.log(
        `DIVERGENCE WARNING: ${expectation.tradeDate} — daily close ${row.daily_close_direction} ` +
          `but distribution window net ${row.distribution_net_direction}. Reporting both. Continuing.`
      );
    }
  }
  return allPassed;
}

function filterDates(rows: AmdDolJoinedRow[], tradeDates: string[]): AmdDolJoinedRow[] {
  const dateSet = new Set(tradeDates);
  return rows.filter((row) => dateSet.has(row.trade_date));
}

function logLoadStats(stats: {
  amdStateTotal: number;
  cohortRows: number;
  cleanTrendMatched: number;
  cleanTrendMissingDates: string[];
  insufficientDataExcluded: number;
  insufficientDataDates: string[];
  skippedNoM5: number;
}): void {
  console.log(`[Dol] Total amd_state rows: ${stats.amdStateTotal}`);
  console.log(`[Dol] After M5 join (>=60 bars): ${stats.cohortRows}`);
  console.log(`[Dol] asian_clean_trend matched: ${stats.cleanTrendMatched}`);
  console.log(`[Dol] asian_clean_trend missing dates: ${stats.cleanTrendMissingDates.join(', ') || 'none'}`);
  console.log(
    `[Dol] INSUFFICIENT_DATA excluded from accuracy: ${stats.insufficientDataExcluded} ` +
      `[${stats.insufficientDataDates.join(', ') || 'none'}]`
  );
  console.log(`[Dol] skipped no M5: ${stats.skippedNoM5}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error('[Dol] Fatal:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
