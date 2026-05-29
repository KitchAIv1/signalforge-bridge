import {
  groupCandlesByUtcHour,
  type OhlcCandle,
} from '../../src/services/amdDetector/amdFeatures.js';
import type { JudasDirection } from '../../src/services/amdDetector/amdTypes.js';
import { ASIAN_UTC_HOURS, DIST_UTC_HOURS } from './chartOhlc.js';
import {
  computeCompressionBreakout,
  computeDelayedDistribution,
} from './sessionExtras.js';

export type JudasWindowVariant = 'current' | 'narrow' | 'tight';

export const LONDON_HOURS_BY_VARIANT: Record<JudasWindowVariant, readonly number[]> = {
  current: [8, 9],
  narrow: [7, 8, 9],
  tight: [7, 8],
};

function parseMid(
  candle: OhlcCandle,
  field: 'o' | 'h' | 'l' | 'c'
): number | null {
  const raw = candle.mid?.[field];
  const parsed = parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function collectHours(
  byHour: Map<number, OhlcCandle>,
  hours: readonly number[]
): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  for (const hour of hours) {
    const candle = byHour.get(hour);
    if (candle) out.push(candle);
  }
  return out;
}

export type JudasDetection = {
  judasDirection: JudasDirection | null;
  judasPips: number | null;
  judasExtremePrice: number | null;
  reversalConfirmed: boolean | null;
  compressionBreakout: boolean;
  delayedDistribution: boolean;
  asianIsFlat: boolean;
  asianRangePips: number | null;
};

function judasFromLondon(londonCandles: OhlcCandle[]): {
  judasDirection: JudasDirection | null;
  judasPips: number | null;
  judasExtremePrice: number | null;
} {
  if (londonCandles.length === 0) {
    return { judasDirection: null, judasPips: null, judasExtremePrice: null };
  }
  const londonHigh = Math.max(
    ...londonCandles.map((c) => parseMid(c, 'h') ?? -Infinity)
  );
  const londonLow = Math.min(
    ...londonCandles.map((c) => parseMid(c, 'l') ?? Infinity)
  );
  const londonOpen = parseMid(londonCandles[0]!, 'o');
  const londonClose = parseMid(londonCandles[londonCandles.length - 1]!, 'c');
  if (
    londonOpen == null ||
    londonClose == null ||
    !Number.isFinite(londonHigh) ||
    !Number.isFinite(londonLow)
  ) {
    return { judasDirection: null, judasPips: null, judasExtremePrice: null };
  }
  const downMove = londonOpen - londonLow;
  const upMove = londonHigh - londonOpen;
  if (downMove > upMove && downMove > 0.0003) {
    return {
      judasDirection: 'DOWN',
      judasPips: Math.round(downMove * 10000),
      judasExtremePrice: londonLow,
    };
  }
  if (upMove > downMove && upMove > 0.0003) {
    return {
      judasDirection: 'UP',
      judasPips: Math.round(upMove * 10000),
      judasExtremePrice: londonHigh,
    };
  }
  return {
    judasDirection: 'FLAT',
    judasPips: 0,
    judasExtremePrice: londonClose,
  };
}

function reversalFromDist(
  judasDirection: JudasDirection | null,
  judasExtreme: number | null,
  asianCandles: OhlcCandle[],
  distCandles: OhlcCandle[]
): boolean | null {
  if (judasDirection == null || judasExtreme == null || distCandles.length === 0) {
    return null;
  }
  if (judasDirection === 'DOWN') {
    const asianHigh =
      asianCandles.length > 0
        ? Math.max(...asianCandles.map((c) => parseMid(c, 'h') ?? 0))
        : judasExtreme;
    const midpoint = (asianHigh + judasExtreme) / 2;
    const closes = distCandles
      .map((c) => parseMid(c, 'c'))
      .filter((v): v is number => v != null);
    return closes.length > 0 ? Math.max(...closes) > midpoint : null;
  }
  if (judasDirection === 'UP') {
    const asianLow =
      asianCandles.length > 0
        ? Math.min(...asianCandles.map((c) => parseMid(c, 'l') ?? Infinity))
        : judasExtreme;
    const midpoint = (asianLow + judasExtreme) / 2;
    const closes = distCandles
      .map((c) => parseMid(c, 'c'))
      .filter((v): v is number => v != null);
    return closes.length > 0 ? Math.min(...closes) < midpoint : null;
  }
  return false;
}

export function detectJudasForWindow(
  allCandles: OhlcCandle[],
  variant: JudasWindowVariant,
  storedAsianRangePips: number | null,
  storedAsianIsFlat: boolean
): JudasDetection {
  const byHour = groupCandlesByUtcHour(allCandles);
  const asianCandles = collectHours(byHour, ASIAN_UTC_HOURS);
  const londonCandles = collectHours(byHour, LONDON_HOURS_BY_VARIANT[variant]);
  const distCandles = collectHours(byHour, DIST_UTC_HOURS);
  const judas = judasFromLondon(londonCandles);
  const reversalConfirmed = reversalFromDist(
    judas.judasDirection,
    judas.judasExtremePrice,
    asianCandles,
    distCandles
  );
  const londonOpen =
    londonCandles.length > 0 ? parseMid(londonCandles[0]!, 'o') : null;
  return {
    ...judas,
    reversalConfirmed,
    compressionBreakout: computeCompressionBreakout(
      judas.judasDirection,
      londonOpen,
      distCandles
    ),
    delayedDistribution: computeDelayedDistribution(
      byHour,
      distCandles,
      londonOpen
    ),
    asianIsFlat: storedAsianIsFlat,
    asianRangePips: storedAsianRangePips,
  };
}
