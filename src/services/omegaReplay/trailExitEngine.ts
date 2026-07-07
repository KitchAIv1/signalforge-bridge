/** OMEGA Trail v1 M5 bar-walk with wall-clock max hold. */

import {
  OMEGA_PIP_SIZE,
  OMEGA_TRAIL_ACTIVATION_R,
  OMEGA_TRAIL_DIST_R,
  slMultiplierForDirection,
} from './liveTrailConstants.js';
import type { ReplayExitReason, TimestampedBar, TradeDirection, TrailExitResult } from './types.js';

function grossPips(
  direction: TradeDirection,
  entryPrice: number,
  exitPrice: number,
): number {
  const move = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return move / OMEGA_PIP_SIZE;
}

function holdMinutes(entryTimeMs: number, exitTimeMs: number): number {
  return Math.round((exitTimeMs - entryTimeMs) / 60000);
}

function buildTrailResult(
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

function maxHoldExitPrice(
  bars: readonly TimestampedBar[],
  barIdx: number,
): number {
  if (barIdx <= 0) return bars[barIdx]!.open;
  return bars[barIdx - 1]!.close;
}

function checkPreActivationSl(
  adverse: number,
  slDist: number,
  activated: boolean,
): boolean {
  return !activated && adverse >= slDist;
}

function updateActivation(
  activated: boolean,
  favorable: number,
  actNeed: number,
): boolean {
  if (activated) return true;
  return OMEGA_TRAIL_ACTIVATION_R <= 0 || favorable >= actNeed;
}

function tryTrailExit(
  direction: TradeDirection,
  entryPrice: number,
  favorable: number,
  peakFavorable: number,
  trailDist: number,
): number | null {
  if (peakFavorable < trailDist) return null;
  const trailLevel = peakFavorable - trailDist;
  if (favorable > trailLevel) return null;
  return trailLevel / OMEGA_PIP_SIZE;
}

export function simulateOmegaTrailExit(params: {
  direction: TradeDirection;
  entryPrice: number;
  structureStop: number;
  entryTimeMs: number;
  bars: readonly TimestampedBar[];
  maxHoldMinutes: number;
  executionCostPips: number;
  trailDistR?: number;
}): TrailExitResult {
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
    return buildTrailResult(
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

  let activated = false;
  let peakFavorable = 0;

  for (let barIdx = 0; barIdx < bars.length; barIdx += 1) {
    const bar = bars[barIdx]!;
    if (bar.timeMs >= maxHoldDeadlineMs) {
      const exitPrice = maxHoldExitPrice(bars, barIdx);
      return buildTrailResult(
        'max_hold',
        entryTimeMs,
        maxHoldDeadlineMs,
        entryPrice,
        exitPrice,
        direction,
        barIdx,
        executionCostPips,
      );
    }

    const favorable =
      direction === 'long' ? bar.high - entryPrice : entryPrice - bar.low;
    const adverse =
      direction === 'long' ? entryPrice - bar.low : bar.high - entryPrice;

    if (checkPreActivationSl(adverse, slDist, activated)) {
      const exitPrice = direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
      return buildTrailResult(
        'trail_sl_hit',
        entryTimeMs,
        bar.timeMs,
        entryPrice,
        exitPrice,
        direction,
        barIdx,
        executionCostPips,
      );
    }

    activated = updateActivation(activated, favorable, actNeed);
    if (activated && favorable > peakFavorable) peakFavorable = favorable;

    const trailGross = tryTrailExit(direction, entryPrice, favorable, peakFavorable, trailDist);
    if (trailGross != null) {
      const exitPrice =
        direction === 'long'
          ? entryPrice + trailGross * OMEGA_PIP_SIZE
          : entryPrice - trailGross * OMEGA_PIP_SIZE;
      return buildTrailResult(
        'trail_stop',
        entryTimeMs,
        bar.timeMs,
        entryPrice,
        exitPrice,
        direction,
        barIdx,
        executionCostPips,
      );
    }

    if (activated && adverse >= slDist) {
      const exitPrice = direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
      return buildTrailResult(
        'trail_sl_hit',
        entryTimeMs,
        bar.timeMs,
        entryPrice,
        exitPrice,
        direction,
        barIdx,
        executionCostPips,
      );
    }
  }

  const lastBar = bars[bars.length - 1]!;
  return buildTrailResult(
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
