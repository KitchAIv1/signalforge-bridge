/** Live-faithful trail + optional progress time-stop (no +minR within deadline → scratch). */

import {
  OMEGA_PIP_SIZE,
  OMEGA_TRAIL_ACTIVATION_R,
  OMEGA_TRAIL_DIST_R,
  slMultiplierForDirection,
} from './liveTrailConstants.js';
import type { ReplayExitReason, TimestampedBar, TradeDirection, TrailExitResult } from './types.js';

export type CounterfactualExitReason = ReplayExitReason | 'progress_time_stop';

export interface ProgressTimeStopParams {
  direction: TradeDirection;
  entryPrice: number;
  structureStop: number;
  entryTimeMs: number;
  bars: readonly TimestampedBar[];
  maxHoldMinutes: number;
  executionCostPips: number;
  trailDistR?: number;
  progressDeadlineMin?: number;
  progressMinR?: number;
}

function grossPips(direction: TradeDirection, entryPrice: number, exitPrice: number): number {
  const move = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return move / OMEGA_PIP_SIZE;
}

function holdMinutes(entryTimeMs: number, exitTimeMs: number): number {
  return Math.round((exitTimeMs - entryTimeMs) / 60000);
}

function favorableAndAdverse(
  direction: TradeDirection,
  entryPrice: number,
  priceHigh: number,
  priceLow: number,
): { favorable: number; adverse: number } {
  if (direction === 'long') {
    return { favorable: priceHigh - entryPrice, adverse: entryPrice - priceLow };
  }
  return { favorable: entryPrice - priceLow, adverse: priceHigh - entryPrice };
}

function buildResult(
  exitReason: CounterfactualExitReason,
  entryTimeMs: number,
  exitTimeMs: number,
  entryPrice: number,
  exitPrice: number,
  direction: TradeDirection,
  exitBarIndex: number,
  execCostPips: number,
): TrailExitResult & { exitReason: CounterfactualExitReason } {
  const gross = grossPips(direction, entryPrice, exitPrice);
  return {
    exitReason,
    exitTimeMs,
    holdMinutes: holdMinutes(entryTimeMs, exitTimeMs),
    grossPips: gross,
    netPips: gross - execCostPips,
    exitBarIndex,
  };
}

function slExitPrice(direction: TradeDirection, entryPrice: number, slDist: number): number {
  return direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
}

function trailExitPrice(
  direction: TradeDirection,
  entryPrice: number,
  trailLevelFavorable: number,
): number {
  return direction === 'long'
    ? entryPrice + trailLevelFavorable
    : entryPrice - trailLevelFavorable;
}

function evaluateTrailHit(
  direction: TradeDirection,
  entryPrice: number,
  activated: boolean,
  peakFavorable: number,
  trailDist: number,
  slDist: number,
  liveFavorable: number,
  liveAdverse: number,
): { reason: ReplayExitReason; exitPrice: number } | null {
  if (!activated && liveAdverse >= slDist) {
    return { reason: 'trail_sl_hit', exitPrice: slExitPrice(direction, entryPrice, slDist) };
  }
  if (activated && peakFavorable >= trailDist) {
    const trailLevel = peakFavorable - trailDist;
    if (liveFavorable <= trailLevel) {
      return { reason: 'trail_stop', exitPrice: trailExitPrice(direction, entryPrice, trailLevel) };
    }
  }
  if (activated && liveAdverse >= slDist) {
    return { reason: 'trail_sl_hit', exitPrice: slExitPrice(direction, entryPrice, slDist) };
  }
  return null;
}

function maxHoldExitPrice(bars: readonly TimestampedBar[], barIdx: number): number {
  if (barIdx <= 0) return bars[barIdx]!.open;
  return bars[barIdx - 1]!.close;
}

export function simulateProgressTimeStopExit(
  params: ProgressTimeStopParams,
): TrailExitResult & { exitReason: CounterfactualExitReason } {
  const {
    direction,
    entryPrice,
    structureStop,
    entryTimeMs,
    bars,
    maxHoldMinutes,
    executionCostPips,
    trailDistR = OMEGA_TRAIL_DIST_R,
    progressDeadlineMin,
    progressMinR,
  } = params;

  const rSizeRaw = Math.abs(entryPrice - structureStop);
  if (rSizeRaw <= 0 || bars.length === 0) {
    const lastMs = bars.at(-1)?.timeMs ?? entryTimeMs;
    return buildResult(
      'insufficient_bars',
      entryTimeMs,
      lastMs,
      entryPrice,
      entryPrice,
      direction,
      0,
      executionCostPips,
    );
  }

  const slDist = rSizeRaw * slMultiplierForDirection(direction);
  const trailDist = rSizeRaw * trailDistR;
  const actNeed = OMEGA_TRAIL_ACTIVATION_R * rSizeRaw;
  const maxHoldDeadlineMs = entryTimeMs + maxHoldMinutes * 60_000;
  const progressDeadlineMs =
    progressDeadlineMin != null ? entryTimeMs + progressDeadlineMin * 60_000 : null;
  const progressNeed = progressMinR != null ? progressMinR * rSizeRaw : null;
  let progressChecked = progressDeadlineMs == null;

  let activated = OMEGA_TRAIL_ACTIVATION_R <= 0;
  let peakFavorable = 0;

  for (let barIdx = 0; barIdx < bars.length; barIdx += 1) {
    const bar = bars[barIdx]!;
    if (bar.timeMs >= maxHoldDeadlineMs) {
      return buildResult(
        'max_hold',
        entryTimeMs,
        maxHoldDeadlineMs,
        entryPrice,
        maxHoldExitPrice(bars, barIdx),
        direction,
        barIdx,
        executionCostPips,
      );
    }

    const candle = favorableAndAdverse(direction, entryPrice, bar.high, bar.low);
    const liveMid = bar.close;
    const live = favorableAndAdverse(direction, entryPrice, liveMid, liveMid);

    activated = activated || candle.favorable >= actNeed;
    if (candle.favorable > peakFavorable) peakFavorable = candle.favorable;

    if (!progressChecked && progressDeadlineMs != null && bar.timeMs >= progressDeadlineMs) {
      progressChecked = true;
      if (progressNeed != null && peakFavorable < progressNeed) {
        return buildResult(
          'progress_time_stop',
          entryTimeMs,
          bar.timeMs,
          entryPrice,
          liveMid,
          direction,
          barIdx,
          executionCostPips,
        );
      }
    }

    const exitHit = evaluateTrailHit(
      direction,
      entryPrice,
      activated,
      peakFavorable,
      trailDist,
      slDist,
      live.favorable,
      live.adverse,
    );
    if (exitHit) {
      return buildResult(
        exitHit.reason,
        entryTimeMs,
        bar.timeMs,
        entryPrice,
        exitHit.exitPrice,
        direction,
        barIdx,
        executionCostPips,
      );
    }
  }

  const lastBar = bars[bars.length - 1]!;
  return buildResult(
    'insufficient_bars',
    entryTimeMs,
    lastBar.timeMs,
    entryPrice,
    lastBar.close,
    direction,
    bars.length - 1,
    executionCostPips,
  );
}
