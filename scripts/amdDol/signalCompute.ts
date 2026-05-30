import {
  ASIAN_UTC_HOURS,
  filterCandlesByUtcHours,
  readOhlcFromChart,
} from '../amdJudasWindow/chartOhlc.js';
import type { AsianMetrics, OandaLevels, TopDownSignals } from './types.js';
import {
  predictedAutoDirection,
  predictedJudasInversionRaw,
  predictedProduction,
} from './productionPredict.js';
import type { AmdDolJoinedRow, PredictionBundle } from './types.js';

function parsePrice(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

export function computeAsianMetrics(
  chartPayload: Record<string, unknown> | null,
  tradeDate: string
): AsianMetrics {
  const chartEntries = readOhlcFromChart(chartPayload);
  const asianCandles = filterCandlesByUtcHours(chartEntries, ASIAN_UTC_HOURS);
  if (asianCandles.length === 0) return emptyAsianMetrics();

  const highs = asianCandles.map((bar) => parsePrice(bar.mid.h));
  const lows = asianCandles.map((bar) => parsePrice(bar.mid.l));
  const asianHigh = maxFinite(highs);
  const asianLow = minFinite(lows);
  const hourZero = asianCandles.find((bar) => new Date(bar.time).getUTCHours() === 0);
  const asianOpen = parsePrice(hourZero?.mid.o ?? asianCandles[0]?.mid.o);
  const hourSeven = asianCandles.find((bar) => new Date(bar.time).getUTCHours() === 7);

  if (!hourSeven) {
    console.warn(`[Dol] no asian close for ${tradeDate}`);
    return { asianHigh, asianLow, asianOpen, asianClose: null, asianClosePositionPct: null, asianCloseBias: null };
  }
  return buildAsianCloseMetrics(asianHigh, asianLow, asianOpen, parsePrice(hourSeven.mid.c));
}

function emptyAsianMetrics(): AsianMetrics {
  return {
    asianHigh: null,
    asianLow: null,
    asianOpen: null,
    asianClose: null,
    asianClosePositionPct: null,
    asianCloseBias: null,
  };
}

function buildAsianCloseMetrics(
  asianHigh: number | null,
  asianLow: number | null,
  asianOpen: number | null,
  asianClose: number | null
): AsianMetrics {
  const range = asianHigh != null && asianLow != null ? asianHigh - asianLow : null;
  const closePct =
    range != null && range > 0 && asianClose != null && asianLow != null
      ? ((asianClose - asianLow) / range) * 100
      : null;
  return {
    asianHigh,
    asianLow,
    asianOpen,
    asianClose,
    asianClosePositionPct: round(closePct, 2),
    asianCloseBias: closeBiasFromPct(closePct),
  };
}

function closeBiasFromPct(closePct: number | null): string | null {
  if (closePct == null) return null;
  if (closePct >= 60) return 'BULLISH';
  if (closePct <= 40) return 'BEARISH';
  return 'NEUTRAL';
}

function maxFinite(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value != null);
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function minFinite(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value != null);
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

export function computeTopDownSignals(
  asian: AsianMetrics,
  levels: OandaLevels,
  row: AmdDolJoinedRow
): TopDownSignals {
  return {
    weeklyOpenBias: openBias(asian.asianOpen, levels.weeklyOpen),
    monthlyOpenBias: openBias(asian.asianOpen, levels.monthlyOpen),
    prevDayPosition: prevDayPosition(asian.asianOpen, levels.prevDayHigh, levels.prevDayLow),
    asianSweptPrevLow: sweptBelow(asian.asianLow, levels.prevDayLow),
    asianSweptPrevHigh: sweptAbove(asian.asianHigh, levels.prevDayHigh),
    judasSweptPrevLow: judasSweptLow(row, levels.prevDayLow),
    judasSweptPrevHigh: judasSweptHigh(row, levels.prevDayHigh),
  };
}

function openBias(asianOpen: number | null, refOpen: number | null): string | null {
  if (asianOpen == null || refOpen == null) return null;
  return asianOpen >= refOpen ? 'ABOVE' : 'BELOW';
}

function prevDayPosition(
  asianOpen: number | null,
  prevDayHigh: number | null,
  prevDayLow: number | null
): string | null {
  if (asianOpen == null || prevDayHigh == null || prevDayLow == null) return null;
  if (asianOpen >= prevDayHigh) return 'ABOVE_PDH';
  if (asianOpen <= prevDayLow) return 'BELOW_PDL';
  return 'INSIDE_RANGE';
}

function sweptBelow(left: number | null, right: number | null): boolean | null {
  if (left == null || right == null) return null;
  return left < right;
}

function sweptAbove(left: number | null, right: number | null): boolean | null {
  if (left == null || right == null) return null;
  return left > right;
}

function judasSweptLow(row: AmdDolJoinedRow, prevDayLow: number | null): boolean | null {
  if (prevDayLow == null || row.judas_extreme_price == null) return null;
  return row.judas_direction === 'DOWN' && row.judas_extreme_price < prevDayLow;
}

function judasSweptHigh(row: AmdDolJoinedRow, prevDayHigh: number | null): boolean | null {
  if (prevDayHigh == null || row.judas_extreme_price == null) return null;
  return row.judas_direction === 'UP' && row.judas_extreme_price > prevDayHigh;
}

export function computePredictions(row: AmdDolJoinedRow): PredictionBundle {
  return {
    predictedJudasInversionRaw: predictedJudasInversionRaw(row.judas_direction),
    predictedAutoDirection: predictedAutoDirection(row.auto_direction),
    predictedProduction: predictedProduction(row),
  };
}
