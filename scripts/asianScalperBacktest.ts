/**
 * Asian session scalper backtest — two cohorts, single config.
 *
 * // Cohort A direction source: asian_direction_log.direction_set
 * // (prior D1 candle close vs open — AMD_SHIFTED days only)
 * // Cohort B direction source: amd_state.auto_direction
 * // reference_price = 00:00 UTC bar close
 * // Asian session: 00:00–08:00 UTC
 * // amd_outcome_tag NOT referenced
 *
 * Run: npx tsx scripts/asianScalperBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { loadCohortA, loadCohortB } from './asianScalperBacktest/loadCohorts.js';
import {
  simulateAsianPriceRatchetDay,
  type AsianRatchetDayResult,
} from './asianScalperBacktest/simulateAsianPriceRatchetDay.js';

dotenv.config();

const PULLBACK = 5;
const TP = 10;
const SL = 10;
const MAX_RATCHETS = 3;

type SummaryRow = {
  cohort: string;
  nDays: number;
  totalTrades: number;
  tradesPerDayAvg: number;
  wins: number;
  losses: number;
  forceFlat: number;
  timeouts: number;
  winPct: number;
  netPipsTotal: number;
  expectancyPerTrade: number;
  daysStoppedBySl: number;
  daysNoTrigger: number;
};

function runCohort(
  cohortLabel: string,
  rows: Awaited<ReturnType<typeof loadCohortA>>,
): AsianRatchetDayResult[] {
  return rows.map((row) =>
    simulateAsianPriceRatchetDay(
      row.tradeDate,
      row.candles,
      row.direction,
      PULLBACK,
      TP,
      SL,
      MAX_RATCHETS,
    ),
  );
}

function summarize(cohort: string, dayResults: AsianRatchetDayResult[]): SummaryRow {
  const allTrades = dayResults.flatMap((day) => day.closedTrades);
  const wins = allTrades.filter((trade) => trade.outcome === 'win').length;
  const losses = allTrades.filter((trade) => trade.outcome === 'loss').length;
  const forceFlat = allTrades.filter((trade) => trade.outcome === 'force_flat').length;
  const timeouts = allTrades.filter((trade) => trade.outcome === 'timeout_0800').length;
  const netPipsTotal = Math.round(allTrades.reduce((sum, trade) => sum + trade.netPips, 0) * 10) / 10;
  const decided = wins + losses;

  return {
    cohort,
    nDays: dayResults.length,
    totalTrades: allTrades.length,
    tradesPerDayAvg:
      dayResults.length > 0
        ? Math.round((allTrades.length / dayResults.length) * 100) / 100
        : 0,
    wins,
    losses,
    forceFlat,
    timeouts,
    winPct: decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0,
    netPipsTotal,
    expectancyPerTrade:
      allTrades.length > 0 ? Math.round((netPipsTotal / allTrades.length) * 100) / 100 : 0,
    daysStoppedBySl: dayResults.filter((day) => day.stoppedBy === 'sl').length,
    daysNoTrigger: dayResults.filter((day) => day.stoppedBy === 'no_trigger').length,
  };
}

function formatSummaryRow(row: SummaryRow): string {
  return [
    row.cohort,
    row.nDays,
    row.totalTrades,
    row.tradesPerDayAvg,
    row.wins,
    row.losses,
    row.forceFlat,
    row.timeouts,
    row.winPct,
    row.netPipsTotal,
    row.expectancyPerTrade,
    row.daysStoppedBySl,
    row.daysNoTrigger,
  ].join(',');
}

function formatDailyRow(cohort: string, day: AsianRatchetDayResult): string {
  return [
    day.tradeDate,
    cohort,
    day.direction,
    day.closedTrades.length,
    day.wins,
    day.losses,
    day.netPips,
    day.stoppedBy,
  ].join(',');
}

async function main(): Promise<void> {
  console.log('[AsianScalper] Loading cohorts...');
  const [cohortARows, cohortBRows] = await Promise.all([loadCohortA(), loadCohortB()]);
  console.log(`[AsianScalper] Cohort A days: ${cohortARows.length}`);
  console.log(`[AsianScalper] Cohort B days: ${cohortBRows.length}`);

  const cohortADays = runCohort('A', cohortARows);
  const cohortBDays = runCohort('B', cohortBRows);
  const summaryA = summarize('A', cohortADays);
  const summaryB = summarize('B', cohortBDays);

  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const summaryHeader =
    'cohort,n_days,total_trades,trades_per_day_avg,wins,losses,force_flat,timeouts,win_pct,net_pips_total,expectancy_per_trade,days_stopped_by_sl,days_no_trigger';
  const summaryCsv = [summaryHeader, formatSummaryRow(summaryA), formatSummaryRow(summaryB)].join('\n');
  fs.writeFileSync(path.join(outDir, 'asian_scalper_backtest.csv'), `${summaryCsv}\n`);

  const dailyHeader = 'date,cohort,direction,trades,wins,losses,net_pips,stopped_by';
  const dailyA = cohortADays.map((day) => formatDailyRow('A', day)).join('\n');
  const dailyB = cohortBDays.map((day) => formatDailyRow('B', day)).join('\n');
  fs.writeFileSync(
    path.join(outDir, 'asian_scalper_daily_cohortA.csv'),
    `${dailyHeader}\n${dailyA}\n`,
  );
  fs.writeFileSync(
    path.join(outDir, 'asian_scalper_daily_cohortB.csv'),
    `${dailyHeader}\n${dailyB}\n`,
  );

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(summaryCsv);
  console.log('');
  console.log(`Wrote ${path.join(outDir, 'asian_scalper_backtest.csv')}`);
}

main().catch((err) => {
  console.error('[AsianScalper] Fatal:', err);
  process.exit(1);
});
