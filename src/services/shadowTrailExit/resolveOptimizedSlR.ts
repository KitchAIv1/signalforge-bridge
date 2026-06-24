/** Direction-specific optimized SL from 180d backtest grid (trail 0.5R unchanged). */

export const SHADOW_TRAIL_SL_R_SHORT = 2.0;
export const SHADOW_TRAIL_SL_R_LONG = 3.0;

export function resolveOptimizedSlR(direction: 'long' | 'short'): number {
  return direction === 'short' ? SHADOW_TRAIL_SL_R_SHORT : SHADOW_TRAIL_SL_R_LONG;
}
