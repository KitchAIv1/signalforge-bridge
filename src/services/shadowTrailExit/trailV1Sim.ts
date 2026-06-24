/** M5 trail v1 bar-walk — SL 1.5R enforced before and after activation. */

import {
  MAX_FORWARD_BARS,
  PIP_SIZE,
  SHADOW_EXECUTION_COST_PIPS,
  SHADOW_TRAIL_ACTIVATION_R,
  SHADOW_TRAIL_DIST_R,
  SHADOW_TRAIL_SL_R,
  type M5Bar,
  type TrailSimOutcome,
} from './types.js';

export function simulateTrailV1(
  direction: 'long' | 'short',
  entryPrice: number,
  rSizeRaw: number,
  bars: readonly M5Bar[],
  slR: number = SHADOW_TRAIL_SL_R,
): TrailSimOutcome {
  const slDist = rSizeRaw * slR;
  const actNeed = SHADOW_TRAIL_ACTIVATION_R * rSizeRaw;
  let activated = false;
  let peakFavorable = 0;
  const limit = Math.min(bars.length, MAX_FORWARD_BARS);

  for (let i = 0; i < limit; i += 1) {
    const bar = bars[i]!;
    const fav =
      direction === 'long' ? bar.high - entryPrice : entryPrice - bar.low;
    const adv =
      direction === 'long' ? entryPrice - bar.low : bar.high - entryPrice;

    if (!activated && adv >= slDist) {
      return buildOutcome('trail_sl', -(slDist / PIP_SIZE), i + 1);
    }

    if (SHADOW_TRAIL_ACTIVATION_R <= 0 || fav >= actNeed) {
      activated = true;
    }

    if (activated && fav > peakFavorable) {
      peakFavorable = fav;
    }

    let trailCandidate = false;
    let trailGross = 0;
    if (activated && peakFavorable > 0) {
      const trailLevel = peakFavorable - SHADOW_TRAIL_DIST_R * rSizeRaw;
      if (fav <= trailLevel) {
        trailCandidate = true;
        trailGross = (peakFavorable - SHADOW_TRAIL_DIST_R * rSizeRaw) / PIP_SIZE;
      }
    }

    if (activated && adv >= slDist) {
      return buildOutcome('trail_sl', -(slDist / PIP_SIZE), i + 1);
    }

    if (trailCandidate) {
      return buildOutcome('trail_profit', trailGross, i + 1);
    }
  }

  const last = bars[limit - 1]?.close ?? entryPrice;
  const gross =
    direction === 'long'
      ? (last - entryPrice) / PIP_SIZE
      : (entryPrice - last) / PIP_SIZE;
  return buildOutcome('open', gross, limit);
}

function buildOutcome(
  exitType: TrailSimOutcome['exitType'],
  grossPips: number,
  exitBars: number,
): TrailSimOutcome {
  const netPips = grossPips - SHADOW_EXECUTION_COST_PIPS;
  return {
    exitType,
    grossPips,
    netPips,
    exitBars,
    win: netPips > 0,
  };
}
