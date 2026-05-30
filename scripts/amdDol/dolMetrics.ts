import '../amdJudasWindow/peakMetrics.js';
import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';
import { entryBarIndexForTag } from './entryBarIndex.js';
import { outcomeDirectionFromTag } from './outcomeTag.js';
import type {
  AmdDolJoinedRow,
  DailyCloseDirection,
  DolBacktestRow,
  OandaLevels,
  PredictionBundle,
  ProductionDirection,
} from './types.js';

type DistributionRange = {
  sortedCandles: M5Bar[];
  distOpen: number | null;
  distHigh: number | null;
  distLow: number | null;
  lastClose: number | null;
  entryBarIndex: number | null;
  entryPrice: number | null;
};

type DolTargetMetrics = {
  primaryTarget: number | null;
  targetDistancePips: number | null;
  alreadyPassed: boolean | null;
  reached: boolean | null;
  barIndexReached: number | null;
  reachedInNyAm: boolean | null;
  weekTarget: number | null;
  weekAlreadyPassed: boolean | null;
  weekReached: boolean | null;
};

const PIP_FACTOR = 10000;

export function computeDolMetrics(
  row: AmdDolJoinedRow,
  predictions: PredictionBundle,
  levels: OandaLevels
): Omit<
  DolBacktestRow,
  | 'trade_date'
  | 'amd_tag'
  | 'daily_bias_alignment'
  | 'layer4_d1_bias'
  | 'layer4_bullish_count'
  | 'layer4_bearish_count'
  | 'layer4_d1_bias_7'
  | 'layer4_bullish_count_7'
  | 'layer4_bearish_count_7'
  | 'm5_vs_judas_direction'
  | 'judas_direction'
  | 'judas_pips'
  | 'judas_extreme_price'
  | 'asian_range_pips'
  | 'asian_is_flat'
  | 'asian_high'
  | 'asian_low'
  | 'asian_open'
  | 'asian_close'
  | 'asian_close_position_pct'
  | 'asian_close_bias'
  | 'prev_day_high'
  | 'prev_day_low'
  | 'prev_day_close'
  | 'prev_week_high'
  | 'prev_week_low'
  | 'weekly_open'
  | 'monthly_open'
  | 'weekly_open_bias_computed'
  | 'monthly_open_bias_computed'
  | 'prev_day_position'
  | 'asian_swept_prev_low'
  | 'asian_swept_prev_high'
  | 'judas_swept_prev_low'
  | 'judas_swept_prev_high'
  | 'prior_d1_direction'
  | 'prior_d1_body_pips'
  | 'asian_clean_trend_matched'
  | 'weekly_monthly_source'
  | 'predicted_judas_inversion_raw'
  | 'predicted_auto_direction'
  | 'predicted_production'
> {
  const distribution = summarizeDistribution(row.m5Candles, row.amd_tag);
  const predicted = predictions.predictedProduction;
  const dailyCloseDirection = dailyDirection(levels.dailyOpen, levels.dailyClose);
  const dol = computeDolTarget(distribution, predicted, levels);
  const peaks = computeFullPeakMetrics(distribution, predicted);
  const outcomeDirection = outcomeDirectionFromTag(row);

  return {
    daily_candle_time_raw: levels.dailyCandleTimeRaw,
    daily_open: levels.dailyOpen,
    daily_high: levels.dailyHigh,
    daily_low: levels.dailyLow,
    daily_close: levels.dailyClose,
    daily_close_direction: dailyCloseDirection,
    entry_bar_index: distribution.entryBarIndex,
    entry_price: distribution.entryPrice,
    dist_open: distribution.distOpen,
    dist_high: distribution.distHigh,
    dist_low: distribution.distLow,
    dol_primary_target: dol.primaryTarget,
    dol_target_distance_pips: dol.targetDistancePips,
    dol_already_passed: dol.alreadyPassed,
    dol_reached: dol.reached,
    bar_index_dol_reached: dol.barIndexReached,
    dol_reached_in_ny_am: dol.reachedInNyAm,
    dol_week_target: dol.weekTarget,
    dol_week_already_passed: dol.weekAlreadyPassed,
    dol_week_reached: dol.weekReached,
    outcome_direction_from_tag: outcomeDirection,
    amd_outcome_tag: row.amd_outcome_tag,
    daily_close_matches_inversion: dailyMatch(dailyCloseDirection, predictions.predictedJudasInversionRaw),
    daily_close_matches_auto: dailyMatch(dailyCloseDirection, predictions.predictedAutoDirection),
    daily_close_matches_production: dailyMatch(dailyCloseDirection, predicted),
    outcome_matches_production: outcomeMatch(predicted, outcomeDirection),
    peak_favorable_pips: peaks.peakFavorablePips,
    peak_counter_pips: peaks.peakCounterPips,
    bar_index_peak_favorable: peaks.barIndexPeakFavorable,
    ny_am_peak: peaks.nyAmPeak,
    net_pips_full: peaks.netPipsFull,
    distribution_net_direction: distributionNetDirection(distribution),
  };
}

function summarizeDistribution(
  m5Candles: M5Bar[],
  amdTag: string | null
): DistributionRange {
  const sortedCandles = [...m5Candles].sort(compareByTime);
  const distOpen = parsePrice(sortedCandles[0]?.o);
  const lastClose = parsePrice(sortedCandles[sortedCandles.length - 1]?.c);
  const entryBarIndex = entryBarIndexForTag(amdTag);
  const entryBar = entryBarIndex >= 0 ? sortedCandles[entryBarIndex] : null;
  const entryPrice = parsePrice(entryBar?.o) ?? distOpen;
  if (entryBarIndex >= 0 && !entryBar) {
    console.warn(`[Dol] missing entry bar ${entryBarIndex} for ${amdTag}, using dist_open`);
  }
  const highs = sortedCandles.map((bar) => parsePrice(bar.h));
  const lows = sortedCandles.map((bar) => parsePrice(bar.l));
  return {
    sortedCandles,
    distOpen,
    distHigh: finiteExtrema(highs, Math.max),
    distLow: finiteExtrema(lows, Math.min),
    lastClose,
    entryBarIndex: entryBarIndex >= 0 ? entryBarIndex : null,
    entryPrice,
  };
}

function computeDolTarget(
  distribution: DistributionRange,
  predicted: ProductionDirection,
  levels: OandaLevels
): DolTargetMetrics {
  const entryPrice = distribution.entryPrice;
  const primaryTarget = targetForDirection(predicted, levels.prevDayHigh, levels.prevDayLow);
  const weekTarget = targetForDirection(predicted, levels.prevWeekHigh, levels.prevWeekLow);
  const primary = dolSide(
    distribution.sortedCandles,
    predicted,
    primaryTarget,
    entryPrice,
    distribution.entryBarIndex ?? 0
  );
  const week = dolSide(
    distribution.sortedCandles,
    predicted,
    weekTarget,
    entryPrice,
    distribution.entryBarIndex ?? 0
  );
  return {
    primaryTarget,
    targetDistancePips: primary.targetDistancePips,
    alreadyPassed: primary.alreadyPassed,
    reached: primary.reached,
    barIndexReached: primary.barIndexReached,
    reachedInNyAm: primary.reachedInNyAm,
    weekTarget,
    weekAlreadyPassed: week.alreadyPassed,
    weekReached: week.reached,
  };
}

function dolSide(
  sortedCandles: M5Bar[],
  predicted: ProductionDirection,
  targetPrice: number | null,
  entryPrice: number | null,
  entryBarIndex: number
): Pick<DolTargetMetrics, 'targetDistancePips' | 'alreadyPassed' | 'reached' | 'barIndexReached' | 'reachedInNyAm'> {
  if (predicted === 'neutral' || entryPrice == null || targetPrice == null) {
    return emptyDolSide();
  }
  const alreadyPassed = isTargetBehindEntry(predicted, targetPrice, entryPrice);
  if (alreadyPassed) {
    return {
      targetDistancePips: targetDistance(predicted, targetPrice, entryPrice),
      alreadyPassed: true,
      reached: null,
      barIndexReached: null,
      reachedInNyAm: null,
    };
  }
  const barIndexReached = firstTargetTouch(
    sortedCandles.slice(entryBarIndex),
    predicted,
    targetPrice,
    entryBarIndex
  );
  return {
    targetDistancePips: targetDistance(predicted, targetPrice, entryPrice),
    alreadyPassed: false,
    reached: barIndexReached != null,
    barIndexReached,
    reachedInNyAm: barIndexReached == null ? null : barIndexReached >= 24 && barIndexReached <= 59,
  };
}

function computeFullPeakMetrics(
  distribution: DistributionRange,
  predicted: ProductionDirection
): {
  peakFavorablePips: number | null;
  peakCounterPips: number | null;
  barIndexPeakFavorable: number | null;
  nyAmPeak: boolean | null;
  netPipsFull: number | null;
} {
  const entryPrice = distribution.entryPrice;
  const entryBarIndex = distribution.entryBarIndex ?? 0;
  if (predicted === 'neutral' || entryPrice == null) {
    return emptyPeakMetrics();
  }
  const direction = productionToDaily(predicted);
  if (!direction) return emptyPeakMetrics();
  const peaks = scanPeaks(
    distribution.sortedCandles.slice(entryBarIndex),
    direction,
    entryPrice,
    entryBarIndex
  );
  const lastClose = distribution.lastClose;
  const netPipsFull =
    lastClose == null
      ? null
      : roundPips(((lastClose - entryPrice) * PIP_FACTOR) * (predicted === 'long' ? 1 : -1));
  return {
    peakFavorablePips: peaks.favorablePips,
    peakCounterPips: peaks.counterPips,
    barIndexPeakFavorable: peaks.favorableIndex,
    nyAmPeak: peaks.favorableIndex == null ? null : peaks.favorableIndex >= 24 && peaks.favorableIndex <= 59,
    netPipsFull,
  };
}

function scanPeaks(
  candlesFromEntry: M5Bar[],
  direction: DailyCloseDirection,
  entryPrice: number,
  indexOffset: number
): { favorablePips: number; counterPips: number; favorableIndex: number | null } {
  let favorablePips = 0;
  let counterPips = 0;
  let favorableIndex: number | null = null;
  candlesFromEntry.forEach((bar, offset) => {
    const high = parsePrice(bar.h);
    const low = parsePrice(bar.l);
    const favorable = favorableMove(direction, entryPrice, high, low);
    const counter = counterMove(direction, entryPrice, high, low);
    if (favorable > favorablePips) {
      favorablePips = favorable;
      favorableIndex = indexOffset + offset;
    }
    counterPips = Math.max(counterPips, counter);
  });
  return {
    favorablePips: roundPips(favorablePips),
    counterPips: roundPips(counterPips),
    favorableIndex,
  };
}

function firstTargetTouch(
  candlesFromEntry: M5Bar[],
  predicted: ProductionDirection,
  targetPrice: number,
  indexOffset: number
): number | null {
  const index = candlesFromEntry.findIndex((bar) => {
    const high = parsePrice(bar.h);
    const low = parsePrice(bar.l);
    if (predicted === 'long') return high != null && high >= targetPrice;
    return low != null && low <= targetPrice;
  });
  return index === -1 ? null : indexOffset + index;
}

function isTargetBehindEntry(
  predicted: ProductionDirection,
  targetPrice: number,
  entryPrice: number
): boolean {
  return predicted === 'long' ? targetPrice <= entryPrice : targetPrice >= entryPrice;
}

function targetForDirection(
  predicted: ProductionDirection,
  highTarget: number | null,
  lowTarget: number | null
): number | null {
  if (predicted === 'long') return highTarget;
  if (predicted === 'short') return lowTarget;
  return null;
}

function targetDistance(
  predicted: ProductionDirection,
  targetPrice: number,
  entryPrice: number
): number {
  const rawDistance = predicted === 'long' ? targetPrice - entryPrice : entryPrice - targetPrice;
  return roundPips(rawDistance * PIP_FACTOR);
}

function favorableMove(
  direction: DailyCloseDirection,
  entryPrice: number,
  high: number | null,
  low: number | null
): number {
  if (direction === 'LONG') return high == null ? 0 : (high - entryPrice) * PIP_FACTOR;
  return low == null ? 0 : (entryPrice - low) * PIP_FACTOR;
}

function counterMove(
  direction: DailyCloseDirection,
  entryPrice: number,
  high: number | null,
  low: number | null
): number {
  if (direction === 'LONG') return low == null ? 0 : (entryPrice - low) * PIP_FACTOR;
  return high == null ? 0 : (high - entryPrice) * PIP_FACTOR;
}

export function dailyDirection(
  openPrice: number | null,
  closePrice: number | null
): DailyCloseDirection | null {
  if (openPrice == null || closePrice == null) return null;
  if (closePrice > openPrice) return 'LONG';
  if (closePrice < openPrice) return 'SHORT';
  return 'DOJI';
}

function dailyMatch(
  dailyCloseDirection: DailyCloseDirection | null,
  predicted: ProductionDirection
): boolean | null {
  if (dailyCloseDirection == null || predicted === 'neutral') return null;
  return productionToDaily(predicted) === dailyCloseDirection;
}

function outcomeMatch(
  predicted: ProductionDirection,
  outcomeDirection: ProductionDirection | null
): boolean | null {
  if (outcomeDirection == null || predicted === 'neutral') return null;
  return predicted === outcomeDirection;
}

function productionToDaily(predicted: ProductionDirection): DailyCloseDirection | null {
  if (predicted === 'long') return 'LONG';
  if (predicted === 'short') return 'SHORT';
  return null;
}

function distributionNetDirection(
  distribution: DistributionRange
): DailyCloseDirection | null {
  if (distribution.distOpen == null || distribution.lastClose == null) return null;
  if (distribution.lastClose > distribution.distOpen) return 'LONG';
  if (distribution.lastClose < distribution.distOpen) return 'SHORT';
  return 'DOJI';
}

function emptyDolSide(): Pick<DolTargetMetrics, 'targetDistancePips' | 'alreadyPassed' | 'reached' | 'barIndexReached' | 'reachedInNyAm'> {
  return {
    targetDistancePips: null,
    alreadyPassed: null,
    reached: null,
    barIndexReached: null,
    reachedInNyAm: null,
  };
}

function emptyPeakMetrics() {
  return {
    peakFavorablePips: null,
    peakCounterPips: null,
    barIndexPeakFavorable: null,
    nyAmPeak: null,
    netPipsFull: null,
  };
}

function finiteExtrema(
  prices: Array<number | null>,
  choose: (...values: number[]) => number
): number | null {
  const finitePrices = prices.filter((price): price is number => price != null);
  return finitePrices.length ? choose(...finitePrices) : null;
}

function parsePrice(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareByTime(leftBar: M5Bar, rightBar: M5Bar): number {
  return new Date(leftBar.time).getTime() - new Date(rightBar.time).getTime();
}

function roundPips(value: number): number {
  return Number(value.toFixed(4));
}
