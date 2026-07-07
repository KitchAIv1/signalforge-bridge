/** Live-faithful OMEGA trail sim: M5 bar wick updates peak; bar close proxies live mid for exit. */

import {
  OMEGA_PIP_SIZE,
  OMEGA_TRAIL_ACTIVATION_R,
  OMEGA_TRAIL_DIST_R,
  slMultiplierForDirection,
} from './liveTrailConstants.js';
import type { ReplayExitReason, TimestampedBar, TradeDirection, TrailExitResult } from './types.js';

export interface LiveFaithfulTrailParams {
  direction: TradeDirection;
  entryPrice: number;
  structureStop: number;
  entryTimeMs: number;
  bars: readonly TimestampedBar[];
  maxHoldMinutes: number;
  executionCostPips: number;
  trailDistR?: number;
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
  exitReason: ReplayExitReason,
  entryTimeMs: number,
  exitTimeMs: number,
  entryPrice: number,
  exitPrice: number,
  direction: TradeDirection,
  exitBarIndex: number,
  execCostPips: number,
): TrailExitResult {
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

function maxHoldExitPrice(bars: readonly TimestampedBar[], barIdx: number): number {
  if (barIdx <= 0) return bars[barIdx]!.open;
  return bars[barIdx - 1]!.close;
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

function evaluateLiveFaithfulExit(
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

export function simulateLiveFaithfulTrailExit(params: LiveFaithfulTrailParams): TrailExitResult {
  const {
    direction,
    entryPrice,
    structureStop,
    entryTimeMs,
    bars,
    maxHoldMinutes,
    executionCostPips,
    trailDistR = OMEGA_TRAIL_DIST_R,
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
    if (activated && candle.favorable > peakFavorable) {
      peakFavorable = candle.favorable;
    }

    const exitHit = evaluateLiveFaithfulExit(
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
