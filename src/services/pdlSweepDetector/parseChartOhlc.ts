import type { ChartOhlcBar } from './pdlSweepTypes.js';

export function parseChartOhlc(chartData: Record<string, unknown> | null): ChartOhlcBar[] {
  const raw = chartData?.ohlc;
  if (!Array.isArray(raw)) return [];
  const bars: ChartOhlcBar[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.time !== 'string') continue;
    const o = row.o != null ? String(row.o) : '';
    const h = row.h != null ? String(row.h) : '';
    const l = row.l != null ? String(row.l) : '';
    const c = row.c != null ? String(row.c) : '';
    if (!o || !h || !l || !c) continue;
    bars.push({ time: row.time, o, h, l, c });
  }
  return bars;
}

export function utcHourFromTime(time: string): number {
  return new Date(time).getUTCHours();
}

export function utcMinuteFromTime(time: string): number {
  return new Date(time).getUTCMinutes();
}

export function firstHourEightBar(bars: ChartOhlcBar[]): ChartOhlcBar | null {
  const hourEight = bars.filter((bar) => utcHourFromTime(bar.time) === 8);
  if (hourEight.length === 0) return null;
  return hourEight.sort((left, right) => left.time.localeCompare(right.time))[0];
}
