/** Run optimized SL sim on an existing shadow row (same M5 bars). */

import { resolveOptimizedSlR } from './resolveOptimizedSlR.js';
import { simulateTrailV1 } from './trailV1Sim.js';
import type { M5Bar, ShadowTrailRow } from './types.js';

export function attachOptimizedShadowSim(
  row: ShadowTrailRow,
  bars: readonly M5Bar[],
): ShadowTrailRow {
  const direction = row.direction as 'long' | 'short';
  const slR = resolveOptimizedSlR(direction);
  const outcome = simulateTrailV1(direction, row.entry_price, row.r_size_raw, bars, slR);
  return {
    ...row,
    shadow_opt_sl_r: slR,
    shadow_opt_exit_type: outcome.exitType,
    shadow_opt_pips_gross: outcome.grossPips,
    shadow_opt_pips_net: outcome.netPips,
    shadow_opt_exit_bars: outcome.exitBars,
    shadow_opt_win: outcome.win,
  };
}
