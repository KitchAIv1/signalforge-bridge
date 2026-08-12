import type { PeakFadeStats, PeakFadeTradeRow } from '@/lib/peakFadeTypes';

export function isPeakFadeOpen(row: PeakFadeTradeRow): boolean {
  return row.result == null;
}

export function computePeakFadeStats(
  rows: PeakFadeTradeRow[],
  todayUtc: string,
): PeakFadeStats {
  const openCount = rows.filter(isPeakFadeOpen).length;
  const todayRows = rows.filter((row) => row.trade_date === todayUtc);
  const closed = rows.filter((row) => !isPeakFadeOpen(row));
  const todayNetPips = todayRows.reduce((sum, row) => {
    const pips = row.pnl_pips_actual ?? row.pnl_pips;
    return sum + (pips ?? 0);
  }, 0);
  const winCount = closed.filter((row) => {
    const pips = row.pnl_pips_actual ?? row.pnl_pips;
    return (pips ?? 0) > 0;
  }).length;
  return {
    openCount,
    todayCount: todayRows.length,
    todayNetPips: Math.round(todayNetPips * 10) / 10,
    closedCount: closed.length,
    winCount,
  };
}
