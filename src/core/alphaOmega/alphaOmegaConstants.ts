/**
 * ALPHAOMEGA (Omega Lane B rewire) — thresholds validated in the Jul 9 2026
 * research session (scripts/omegaHardStopExit.ts, omegaEntrySpeedFloorTest.ts).
 * Lane A (oanda_practice) is entirely unaffected — these constants are only
 * consumed by Lane B (oanda_phase2_demo) code paths.
 */

export const OMEGA_LANE_B_BROKER_ID = 'oanda_phase2_demo';

/** Entry: founding streak must reach this length within ENTRY_SPEED_CEILING_MIN. */
export const ENTRY_STREAK_LENGTH = 7;
/** Entry: founding streak must complete arming within this many minutes. */
export const ENTRY_SPEED_CEILING_MIN = 45;
/** A gap this long or longer between same-direction fires breaks the streak (weekend/quiet-hours guard). */
export const MAX_INTRA_RUN_GAP_MINUTES = 60;

/** Entry: additionally require the founding streak to have taken at least this long to form
 * (fast, sub-30min bursts back-tested weaker; validated net improvement +14p over 69 trades). */
export const ENTRY_SPEED_FLOOR_MIN = 30;

/** Exit: close as soon as this many opposing-direction fires accumulate since entry. */
export const OPPOSING_FIRE_COUNT_THRESHOLD = 5;
/** Exit backup trigger: close if the opposing-fire SHARE reaches this (checked once
 * OPPOSING_SHARE_MIN_FIRES total fires have occurred since entry) — catches a run of
 * fires that are ALL opposing before the raw count threshold is reached. Validated
 * alongside OPPOSING_FIRE_COUNT_THRESHOLD in the Jul 9 research session. */
export const OPPOSING_SHARE_THRESHOLD = 1.0;
export const OPPOSING_SHARE_MIN_FIRES = 4;
/** Exit: hard adverse-price stop, checked bar-by-bar on live M5 candles. */
export const HARD_STOP_PIPS = 10;
/** Exit: backstop uses the SAME streak/speed bar as entry (our own direction reconfirms, then cracks). */
export const BACKSTOP_STREAK_LENGTH = ENTRY_STREAK_LENGTH;
export const BACKSTOP_SPEED_CEILING_MIN = ENTRY_SPEED_CEILING_MIN;

export const PIP_SIZE = 0.0001;

export const ALPHAOMEGA_ENABLED_CONFIG_KEY = 'alpha_omega_enabled';

export const ALPHAOMEGA_BLOCK_NO_CRACK = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';
export const ALPHAOMEGA_BLOCK_SPEED_FLOOR = 'ALPHAOMEGA_SPEED_FLOOR';
export const ALPHAOMEGA_BLOCK_ALREADY_OPEN = 'ALPHAOMEGA_ALREADY_OPEN';

export const ALPHAOMEGA_CLOSE_OPPOSING_COUNT = 'alphaomega_opposing_count';
export const ALPHAOMEGA_CLOSE_OPPOSING_SHARE = 'alphaomega_opposing_share';
export const ALPHAOMEGA_CLOSE_HARD_STOP = 'alphaomega_hard_stop';
export const ALPHAOMEGA_CLOSE_BACKSTOP_CRACK = 'alphaomega_backstop_crack';

export function isOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  return brokerId === OMEGA_LANE_B_BROKER_ID;
}
