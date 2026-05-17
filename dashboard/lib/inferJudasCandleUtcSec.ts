import type { UTCTimestamp } from 'lightweight-charts';
import type { RawAmdOhlcBar } from '@/lib/parseAmdChartOhlc';

function dayStartUnixSec(tradeDate: string): number {
  const startMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  return Math.floor(startMs / 1000);
}

function barunixSec(bar: RawAmdOhlcBar): number {
  return Math.floor(new Date(bar.time).getTime() / 1000);
}

function londonWindowBars(rawBars: RawAmdOhlcBar[], tradeDate: string): RawAmdOhlcBar[] {
  const startSec = dayStartUnixSec(tradeDate);
  const londonFrom = startSec + 8 * 3600;
  const londonTo = startSec + 10 * 3600;
  const out: RawAmdOhlcBar[] = [];
  for (const bar of rawBars) {
    const t = barunixSec(bar);
    if (t >= londonFrom && t < londonTo) out.push(bar);
  }
  return out;
}

function pickJudasUtcSec(rows: RawAmdOhlcBar[], dir: 'UP' | 'DOWN'): UTCTimestamp | null {
  if (rows.length === 0) return null;
  if (dir === 'DOWN') {
    let bestRow = rows[0];
    let bestLow = parseFloat(bestRow.l);
    for (const row of rows) {
      const nextLow = parseFloat(row.l);
      if (nextLow < bestLow) {
        bestLow = nextLow;
        bestRow = row;
      }
    }
    return barunixSec(bestRow) as UTCTimestamp;
  }
  let hiRow = rows[0];
  let bestHigh = parseFloat(hiRow.h);
  for (const row of rows) {
    const nextHi = parseFloat(row.h);
    if (nextHi > bestHigh) {
      bestHigh = nextHi;
      hiRow = row;
    }
  }
  return barunixSec(hiRow) as UTCTimestamp;
}

/** London 08–10 UTC: extreme-low for DOWN Judas / extreme-high for UP. */
export function inferJudasCandleUtcSec(
  rawBars: RawAmdOhlcBar[],
  tradeDate: string,
  judasDirection: 'UP' | 'DOWN' | 'FLAT' | null
): UTCTimestamp | null {
  const londonBars = londonWindowBars(rawBars, tradeDate);
  if (judasDirection === 'UP' || judasDirection === 'DOWN') {
    return pickJudasUtcSec(londonBars, judasDirection);
  }
  if (judasDirection !== 'FLAT') return null;
  if (londonBars.length === 0) return null;
  const midpointIdx = Math.floor(londonBars.length / 2);
  return barunixSec(londonBars[midpointIdx]) as UTCTimestamp;
}

