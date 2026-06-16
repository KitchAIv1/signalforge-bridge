'use client';

import { useMemo } from 'react';
import { groupMultiLegTrades } from '@/lib/multiLegAggregation';
import type { DaySummary, PnlTradeRow } from '@/lib/pnlCalendarTypes';

export function usePnlCalendarDerivedStats(
  trades: PnlTradeRow[],
  daySummaries: Map<string, DaySummary>
) {
  return useMemo(() => {
    let totalR = 0;
    let totalDollars = 0;
    for (const day of daySummaries.values()) {
      totalR += day.netR;
      totalDollars += day.netDollars;
    }
    const effectiveTrades = groupMultiLegTrades(trades);
    const totalTrades = effectiveTrades.length;
    const totalWins = effectiveTrades.filter((trade) => trade.result === 'win').length;
    const globalWinRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;
    let bestDay: DaySummary | null = null;
    let worstDay: DaySummary | null = null;
    for (const day of daySummaries.values()) {
      if (!bestDay || day.netR > bestDay.netR) bestDay = day;
      if (!worstDay || day.netR < worstDay.netR) worstDay = day;
    }
    const hasNullDollarsGlobal = trades.some((t) => t.pnl_dollars === null);
    const nullDollarTradeCount = trades.filter((t) => t.pnl_dollars === null).length;
    return {
      totalR: Math.round(totalR * 100) / 100,
      totalDollars: Math.round(totalDollars * 100) / 100,
      totalTrades,
      totalWins,
      globalWinRate,
      bestDay,
      worstDay,
      hasNullDollarsGlobal,
      nullDollarTradeCount,
    };
  }, [trades, daySummaries]);
}
