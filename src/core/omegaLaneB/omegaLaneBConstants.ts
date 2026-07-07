/** Omega Lane B (Phase 2 experiment) identifiers — Lane A untouched. */

export const OMEGA_LANE_B_BROKER_ID = 'oanda_phase2_demo';

export const LANE_B_CONFIG_R1_ENFORCE = 'omega_lane_b_r1_enforce';
export const LANE_B_CONFIG_PHASE2_SHADOW = 'omega_lane_b_phase2_shadow';
export const LANE_B_CONFIG_PHASE2_ENFORCE = 'omega_lane_b_phase2_enforce';

export const LANE_B_BLOCK_R1_FLIP = 'OMEGA_LANE_B_R1_FLIP';
export const LANE_B_BLOCK_PHASE2_DIST = 'OMEGA_LANE_B_PHASE2_DIST_SKIP';

/** R1: block opposite flip 90m after trail_stop < 3p, entry 00–05 UTC. */
export const LANE_B_R1_COOLDOWN_MIN = 90;
export const LANE_B_R1_MAX_PRIOR_TRAIL_PIPS = 3;
export const LANE_B_R1_ASIA_HOURS_ONLY = true;
