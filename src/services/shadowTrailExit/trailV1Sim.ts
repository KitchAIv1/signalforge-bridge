/** M5 trail v1 bar-walk (matches SIGNALFORGE backtest). */

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
): TrailSimOutcome {
  const slDist = rSizeRaw * SHADOW_TRAIL_SL_R;
  const trailDist = rSizeRaw * SHADOW_TRAIL_DIST_R;
  let peak = 0;
  let active = SHADOW_TRAIL_ACTIVATION_R <= 0;

  for (let i = 0; i < Math.min(bars.length, MAX_FORWARD_BARS); i += 1) {
    const bar = bars[i]!;
    const fav =
      direction === 'long' ? bar.high - entryPrice : entryPrice - bar.low;
    const adv =
      direction === 'long' ? entryPrice - bar.low : bar.high - entryPrice;
    if (!active && adv >= slDist) {
      const gross = -(slDist / PIP_SIZE);
      return buildOutcome('trail_sl', gross, i + 1);
    }
    active = active || fav >= rSizeRaw * SHADOW_TRAIL_ACTIVATION_R;
    if (active && fav > peak) peak = fav;
    if (active && peak >= trailDist && fav <= peak - trailDist) {
      const gross = (peak - trailDist) / PIP_SIZE;
      return buildOutcome('trail_profit', gross, i + 1);
    }
  }
  const last = bars[Math.min(bars.length, MAX_FORWARD_BARS) - 1]?.close ?? entryPrice;
  const gross =
    direction === 'long'
      ? (last - entryPrice) / PIP_SIZE
      : (entryPrice - last) / PIP_SIZE;
  return buildOutcome('open', gross, bars.length);
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
