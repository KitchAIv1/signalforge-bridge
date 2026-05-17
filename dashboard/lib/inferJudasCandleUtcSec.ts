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

/** London-window bar whose **high** (UP) or **low** (DOWN) has smallest distance to `judasExtremePrice`. */
function pickLondonBarClosestToJudasExtremePrice(
  londonBars: RawAmdOhlcBar[],
  judasDirection: 'UP' | 'DOWN',
  judasExtremePrice: number
): RawAmdOhlcBar {
  const seedBar = londonBars[0];
  if (judasDirection === 'UP') {
    return londonBars.reduce((bestCandidate, londonBarCandidate) =>
      Math.abs(parseFloat(londonBarCandidate.h) - judasExtremePrice) <
      Math.abs(parseFloat(bestCandidate.h) - judasExtremePrice)
        ? londonBarCandidate
        : bestCandidate,
    seedBar,
    );
  }
  return londonBars.reduce((bestCandidate, londonBarCandidate) =>
    Math.abs(parseFloat(londonBarCandidate.l) - judasExtremePrice) <
    Math.abs(parseFloat(bestCandidate.l) - judasExtremePrice)
      ? londonBarCandidate
      : bestCandidate,
  seedBar,
  );
}

/**
 * London 08–10 UTC: Judas candle time via stored `judas_extreme_price` when available,
 * else extreme-high (UP) / extreme-low (DOWN) heuristic.
 */
export function inferJudasCandleUtcSec(
  rawBars: RawAmdOhlcBar[],
  tradeDate: string,
  judasDirection: 'UP' | 'DOWN' | 'FLAT' | null,
  judasExtremePrice?: number | null,
): UTCTimestamp | null {
  const londonBars = londonWindowBars(rawBars, tradeDate);

  if (judasDirection === 'UP' || judasDirection === 'DOWN') {
    if (judasExtremePrice != null && londonBars.length > 0) {
      const matchedBar = pickLondonBarClosestToJudasExtremePrice(
        londonBars,
        judasDirection,
        judasExtremePrice,
      );
      return barunixSec(matchedBar) as UTCTimestamp;
    }
    return pickJudasUtcSec(londonBars, judasDirection);
  }

  if (judasDirection !== 'FLAT') return null;
  if (londonBars.length === 0) return null;
  const midpointIdx = Math.floor(londonBars.length / 2);
  return barunixSec(londonBars[midpointIdx]) as UTCTimestamp;
}
