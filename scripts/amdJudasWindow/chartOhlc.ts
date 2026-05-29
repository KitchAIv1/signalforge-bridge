/** chart_data H1 OHLC parsing — flat o/h/l/c (amdChartPayload shape). */

import type { OhlcCandle } from '../../src/services/amdDetector/amdFeatures.js';

export type ChartOhlcEntry = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

export function readOhlcFromChart(
  chartData: Record<string, unknown> | null
): ChartOhlcEntry[] {
  if (!chartData) return [];
  const raw = chartData['ohlc'];
  if (!Array.isArray(raw)) return [];
  return raw as ChartOhlcEntry[];
}

export function chartEntryToOhlc(entry: ChartOhlcEntry): OhlcCandle {
  return {
    time: entry.time,
    mid: { o: entry.o, h: entry.h, l: entry.l, c: entry.c },
    complete: true,
  };
}

export function filterCandlesByUtcHours(
  entries: ChartOhlcEntry[],
  hours: readonly number[]
): OhlcCandle[] {
  const hourSet = new Set(hours);
  return entries
    .filter((entry) => hourSet.has(new Date(entry.time).getUTCHours()))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .map(chartEntryToOhlc);
}

export const ASIAN_UTC_HOURS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const DIST_UTC_HOURS = [10, 11, 12, 13] as const;
