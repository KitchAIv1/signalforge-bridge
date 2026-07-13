/**
 * RAW Omega policy config keys — pure sizing + fixed pip peak giveback.
 * Mirrors ALPHAOMEGA pure-sizing rollout pattern (bridge_config flags).
 */

/** When true: Omega sizes at equity×weight×riskPct only (no AMD/news/confluence/graduated). */
export const OMEGA_RAW_PURE_SIZING_CONFIG_KEY = 'omega_raw_pure_sizing';

/**
 * When > 0: Omega trail_distance = pips × pipSize (fixed giveback from peak).
 * When null/0/missing: legacy trail_distance = rSizeRaw × TRAIL_STOP_TRAIL_DISTANCE_OMEGA (0.5R).
 */
export const OMEGA_TRAIL_PEAK_GIVEBACK_PIPS_CONFIG_KEY = 'omega_trail_peak_giveback_pips';

/** Confluence score that leaves calculateUnits riskPct unscaled (<75 cuts, >=85 boosts). */
export const OMEGA_RAW_PURE_SIZING_NEUTRAL_CONFLUENCE = 80;

/** Validated RAW exit: 1.5 pips fixed giveback from peak. */
export const OMEGA_RAW_PEAK_GIVEBACK_PIPS_DEFAULT = 1.5;
