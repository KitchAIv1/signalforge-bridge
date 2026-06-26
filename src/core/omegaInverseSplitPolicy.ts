/**
 * Omega inverse direction split — live routing policy.
 *
 * When DISABLED (hybrid deployable / B0 backtest baseline):
 *   - Asian DTW vs omega_direction mismatch → hybrid entry gate BLOCK (no trade)
 *   - Dist 10:31–16:00 → prime executes DTW as fired (no inverse)
 *   - omega_raw_mode ON → inverse already skipped; DTW fires with gates bypassed
 *
 * Legacy execution path remains in omegaInverseRouter.ts for dashboard/history only.
 */

export function isOmegaInverseSplitEnabled(engineId: string, rawMode: boolean): boolean {
  if (engineId !== 'omega' || rawMode) {
    return false;
  }
  return false;
}

export const OMEGA_INVERSE_SPLIT_DISABLED_REASON =
  'Hybrid deployable policy — inverse split disabled (Asian inverse audit B0 vs B1, 180d −236.7p)';
