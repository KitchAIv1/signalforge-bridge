import type { ConditionsMet, PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import {
  pdlLiveSideFromConditions,
  researchNetPipsForSide,
  type PdlLiveSide,
} from '@/lib/pdlWindowDirection';

export type PdlResearchBookDayPnl = {
  tradeDate: string;
  netPips: number;
  side: PdlLiveSide;
};

export type PdlResearchBookStats = {
  evaluatedDays: number;
  totalNetPips: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number | null;
  maxDrawdownPips: number;
  bestDayPips: number | null;
  worstDayPips: number | null;
  avgNetPips: number | null;
};

const EMPTY_STATS: PdlResearchBookStats = {
  evaluatedDays: 0,
  totalNetPips: 0,
  wins: 0,
  losses: 0,
  breakevens: 0,
  winRatePct: null,
  maxDrawdownPips: 0,
  bestDayPips: null,
  worstDayPips: null,
  avgNetPips: null,
};

function asConditionsMet(
  raw: Record<string, unknown> | null,
): ConditionsMet | null {
  if (!raw) return null;
  if (
    typeof raw.pdl_breach !== 'boolean' ||
    typeof raw.london_down !== 'boolean' ||
    typeof raw.h11_up !== 'boolean'
  ) {
    return null;
  }
  return {
    pdl_breach: raw.pdl_breach,
    london_down: raw.london_down,
    h11_up: raw.h11_up,
  };
}

/** Chronological day PnLs under the live research rule (H12 − spread). */
export function buildPdlResearchBookDayPnls(
  rows: readonly PdlSweepSignalRow[],
): PdlResearchBookDayPnl[] {
  const dayPnls: PdlResearchBookDayPnl[] = [];
  const sorted = [...rows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  for (const row of sorted) {
    const conditions = asConditionsMet(row.conditions_met);
    if (!conditions || row.outcome_h12_net_pips == null) continue;
    const side = pdlLiveSideFromConditions(conditions);
    const netPips = researchNetPipsForSide(side, row.outcome_h12_net_pips);
    if (netPips == null) continue;
    dayPnls.push({ tradeDate: row.trade_date.slice(0, 10), netPips, side });
  }
  return dayPnls;
}

export function maxDrawdownFromNetSeries(netPipsSeries: readonly number[]): number {
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const dayNet of netPipsSeries) {
    equity += dayNet;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return Math.round(maxDrawdown * 10) / 10;
}

function tallyDayPnls(dayPnls: readonly PdlResearchBookDayPnl[]) {
  let totalNetPips = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let bestDayPips = dayPnls[0].netPips;
  let worstDayPips = dayPnls[0].netPips;
  const series: number[] = [];

  for (const day of dayPnls) {
    totalNetPips += day.netPips;
    series.push(day.netPips);
    if (day.netPips > 0) wins += 1;
    else if (day.netPips < 0) losses += 1;
    else breakevens += 1;
    if (day.netPips > bestDayPips) bestDayPips = day.netPips;
    if (day.netPips < worstDayPips) worstDayPips = day.netPips;
  }

  return { totalNetPips, wins, losses, breakevens, bestDayPips, worstDayPips, series };
}

export function computePdlResearchBookStats(
  rows: readonly PdlSweepSignalRow[],
): PdlResearchBookStats {
  const dayPnls = buildPdlResearchBookDayPnls(rows);
  if (dayPnls.length === 0) return EMPTY_STATS;

  const tally = tallyDayPnls(dayPnls);
  const decided = tally.wins + tally.losses;
  const winRatePct =
    decided === 0 ? null : Math.round((tally.wins / decided) * 1000) / 10;

  return {
    evaluatedDays: dayPnls.length,
    totalNetPips: Math.round(tally.totalNetPips * 10) / 10,
    wins: tally.wins,
    losses: tally.losses,
    breakevens: tally.breakevens,
    winRatePct,
    maxDrawdownPips: maxDrawdownFromNetSeries(tally.series),
    bestDayPips: tally.bestDayPips,
    worstDayPips: tally.worstDayPips,
    avgNetPips: Math.round((tally.totalNetPips / dayPnls.length) * 10) / 10,
  };
}
