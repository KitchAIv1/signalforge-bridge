/** Dashboard mirror of backend Lane B / AO broker ids. */
export const OMEGA_LANE_B_BROKER_ID = 'oanda_phase2_demo';
export const OMEGA_AO_VT_BROKER_ID = 'vtmarkets_ao_live';
export const OMEGA_AO_BROKER_IDS = [OMEGA_LANE_B_BROKER_ID, OMEGA_AO_VT_BROKER_ID] as const;

export function isOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  if (!brokerId) return false;
  return (OMEGA_AO_BROKER_IDS as readonly string[]).includes(brokerId);
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
export const ALPHAOMEGA_ENTRY_SPEED_FLOOR_MIN = 30;
export const ALPHAOMEGA_OPPOSING_FIRE_THRESHOLD = 5;
export const ALPHAOMEGA_HARD_STOP_PIPS = 10;
export const ALPHAOMEGA_ENABLED_CONFIG_KEY = 'alpha_omega_enabled';
/** Peak-favorable-giveback profit lock — additive, kill-switched via alpha_omega_giveback_trail_enabled. */
export const ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS = 6;
export const ALPHAOMEGA_GIVEBACK_PIPS = 3;
