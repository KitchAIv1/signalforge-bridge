/** Build completed UTC D1 OHLC from M5 mid candles (no look-ahead). */

export interface PeakFadeM5Bar {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PeakFadeD1Bar {
  dayKey: string;
  closeMs: number;
  high: number;
  low: number;
}

function utcDayKey(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

export function buildD1BarsFromM5(bars: readonly PeakFadeM5Bar[]): PeakFadeD1Bar[] {
  const byDay = new Map<string, PeakFadeM5Bar[]>();
  for (const bar of bars) {
    const key = utcDayKey(bar.timeMs);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(bar);
    else byDay.set(key, [bar]);
  }
  const days = [...byDay.keys()].sort();
  const d1Bars: PeakFadeD1Bar[] = [];
  for (const dayKey of days) {
    const session = byDay.get(dayKey)!;
    session.sort((a, b) => a.timeMs - b.timeMs);
    const first = session[0]!;
    const last = session[session.length - 1]!;
    let high = first.high;
    let low = first.low;
    for (const bar of session) {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
    }
    d1Bars.push({ dayKey, closeMs: last.timeMs, high, low });
  }
  return d1Bars;
}

/** Latest D1 whose last M5 open is strictly before `asOfMs`. */
export function priorCompletedD1(
  d1Bars: readonly PeakFadeD1Bar[],
  asOfMs: number,
): PeakFadeD1Bar | null {
  let prior: PeakFadeD1Bar | null = null;
  for (const day of d1Bars) {
    if (day.closeMs < asOfMs) prior = day;
    else break;
  }
  return prior;
}
