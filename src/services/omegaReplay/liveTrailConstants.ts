/** Live OMEGA Trail v1 params — locked to production. */

export const OMEGA_EXEC_COST_PIPS = 1.2;
export const OMEGA_TRAIL_DIST_R = 0.5;
export const OMEGA_TRAIL_ACTIVATION_R = 0;
export const OMEGA_SL_R_SHORT = 2.0;
export const OMEGA_SL_R_LONG = 3.0;
export const OMEGA_DEFAULT_MAX_HOLD_MINUTES = 180;
export const OMEGA_PIP_SIZE = 0.0001;

export function slMultiplierForDirection(direction: 'long' | 'short'): number {
  return direction === 'short' ? OMEGA_SL_R_SHORT : OMEGA_SL_R_LONG;
}
