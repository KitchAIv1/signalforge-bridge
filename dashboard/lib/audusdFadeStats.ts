import type { AudusdFadeStats, AudusdFadeTradeRow } from '@/lib/audusdFadeTypes';

export function isFadeTradeOpen(row: AudusdFadeTradeRow): boolean {
  return row.result == null;
}

export function isFadeTradeSuccessful(row: AudusdFadeTradeRow): boolean | null {
  if (isFadeTradeOpen(row)) return null;
  if (row.result === 'win') return true;
  if (row.result === 'loss') return false;
  const effectivePips = row.pnl_pips_actual ?? row.pnl_pips;
  if (effectivePips == null) return null;
  return effectivePips > 0;
}

export function effectivePnlPips(row: AudusdFadeTradeRow): number | null {
  return row.pnl_pips_actual ?? row.pnl_pips;
}

export function computeTradeDurationMinutes(row: AudusdFadeTradeRow): number | null {
  if (!row.opened_at) return null;
  const endMs = row.closed_at
    ? new Date(row.closed_at).getTime()
    : Date.now();
  return Math.floor((endMs - new Date(row.opened_at).getTime()) / 60000);
}

function formatWinRate(wins: number, closed: number): string {
  if (closed === 0) return '—';
  return `${Math.round((wins / closed) * 100)}% (${wins}/${closed})`;
}

export function computeAudusdFadeStats(
  rows: AudusdFadeTradeRow[],
  todayUtc: string,
): AudusdFadeStats {
  const closedRows = rows.filter((row) => !isFadeTradeOpen(row));
  const wins = closedRows.filter((row) => isFadeTradeSuccessful(row) === true).length;
  const losses = closedRows.filter((row) => isFadeTradeSuccessful(row) === false).length;
  const netPips = closedRows.reduce(
    (sum, row) => sum + (effectivePnlPips(row) ?? 0),
    0,
  );

  return {
    totalTrades: rows.length,
    closedTrades: closedRows.length,
    openTrades: rows.filter(isFadeTradeOpen).length,
    wins,
    losses,
    winRateLabel: formatWinRate(wins, closedRows.length),
    netPips: Math.round(netPips * 10) / 10,
    todayTradeCount: rows.filter((row) => row.trade_date === todayUtc).length,
  };
}
