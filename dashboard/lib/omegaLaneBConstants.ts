/** Dashboard mirror of backend Lane B / AO broker ids. */
export const OMEGA_LANE_B_BROKER_ID = 'oanda_phase2_demo';
export const OMEGA_AO_VT_BROKER_ID = 'vtmarkets_ao_live';
/** Live AO books only — never include Shadow paper. */
export const OMEGA_AO_BROKER_IDS = [OMEGA_LANE_B_BROKER_ID, OMEGA_AO_VT_BROKER_ID] as const;
/** Shadow AO paper broker — outside live fan-out / Calendar AO filter. */
export const OMEGA_AO_SHADOW_BROKER_ID = 'ao_shadow_paper';
/** Brokers excluded from Activity default ledger (live AO + shadow paper). */
export const OMEGA_AO_ACTIVITY_EXCLUDE_BROKER_IDS = [
  ...OMEGA_AO_BROKER_IDS,
  OMEGA_AO_SHADOW_BROKER_ID,
] as const;
export const ALPHAOMEGA_SHADOW_ENABLED_CONFIG_KEY = 'alpha_omega_shadow_enabled';
export const ALPHAOMEGA_SHADOW_ENTRY_ADVISORY_PREFIX = 'ALPHAOMEGA_SHADOW_ENTRY';

export function isOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  if (!brokerId) return false;
  return (OMEGA_AO_BROKER_IDS as readonly string[]).includes(brokerId);
}

export function isOmegaAoShadowBroker(brokerId: string | null | undefined): boolean {
  return brokerId === OMEGA_AO_SHADOW_BROKER_ID;
}

/** Mirror of src/core/omegaLaneB/omegaLaneBConstants.ts block reasons (legacy R1/Phase2 — no longer enforced, kept for historical row display). */
export const LANE_B_BLOCK_R1_FLIP = 'OMEGA_LANE_B_R1_FLIP';
export const LANE_B_BLOCK_PHASE2_DIST = 'OMEGA_LANE_B_PHASE2_DIST_SKIP';

/**
 * ALPHAOMEGA branding — single source of truth for the cosmetic rename.
 * broker_id, display_name ('AUD_NEWWWW'), and the /omega-phase2 route are
 * intentionally unchanged; only user-facing labels change.
 */
export const ALPHAOMEGA_NAV_LABEL = 'ALPHAOMEGA';
export const ALPHAOMEGA_PAGE_TITLE = 'ALPHAOMEGA (Phase 2)';
export const ALPHAOMEGA_BANNER_LABEL = 'ALPHAOMEGA';

/** Dashboard mirrors of src/core/alphaOmega/alphaOmegaConstants.ts (display only). */
export const ALPHAOMEGA_ENTRY_STREAK_LENGTH = 7;
export const ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN = 45;
/**
 * Must match bridge ENTRY_SPEED_FLOOR_MIN.
 * Live gate compares 1-decimal advisory speed: Number(speed.toFixed(1)) <= floor → block.
 */
export const ALPHAOMEGA_ENTRY_SPEED_FLOOR_MIN = 35;
/** CF-C drop band upper bound — advisory (45, 60] blocked; keep (35, 45] and >60. */
export const ALPHAOMEGA_ENTRY_SPEED_MID_BAND_MAX_MIN = 60;
/** AO new-entry blackout [21:00, 21:15) UTC — place only; observe/exits stay live. */
export const ALPHAOMEGA_ENTRY_BLACKOUT_START_UTC_MIN = 21 * 60;
export const ALPHAOMEGA_ENTRY_BLACKOUT_END_UTC_MIN = 21 * 60 + 15;
export const ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD = 5;
export const ALPHAOMEGA_HARD_STOP_PIPS = 10;
export const ALPHAOMEGA_ENABLED_CONFIG_KEY = 'alpha_omega_enabled';
/** Peak-favorable-giveback profit lock — additive, kill-switched via alpha_omega_giveback_trail_enabled. */
export const ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS = 6;
export const ALPHAOMEGA_GIVEBACK_PIPS = 3;
