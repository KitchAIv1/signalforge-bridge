/**
 * ALPHAOMEGA (Omega Lane B rewire) — thresholds validated in the Jul 9 2026
 * research session (scripts/omegaHardStopExit.ts, omegaEntrySpeedFloorTest.ts).
 * Lane A (oanda_practice) is entirely unaffected — these constants are only
 * consumed by Lane B (oanda_phase2_demo) code paths.
 */

/** Canonical OANDA AO book (Lane B). Kept for Override / OANDA-scoped UI. */
export const OMEGA_LANE_B_BROKER_ID = 'oanda_phase2_demo';

/** Live VT Markets MT5 AO book — dual-venue alongside OANDA Lane B. */
export const OMEGA_AO_VT_BROKER_ID = 'vtmarkets_ao_live';

/**
 * All brokers that run ALPHAOMEGA entry/exit (not RAW Omega trail).
 * Dual books share streak; already-open and position_state are per broker_id.
 */
export const OMEGA_AO_BROKER_IDS = [OMEGA_LANE_B_BROKER_ID, OMEGA_AO_VT_BROKER_ID] as const;

export type OmegaAoBrokerId = (typeof OMEGA_AO_BROKER_IDS)[number];

/** Entry: founding streak must reach this length within ENTRY_SPEED_CEILING_MIN. */
export const ENTRY_STREAK_LENGTH = 7;
/** Entry: founding streak must complete arming within this many minutes. */
export const ENTRY_SPEED_CEILING_MIN = 45;
/** A gap this long or longer between same-direction fires breaks the streak (weekend/quiet-hours guard). */
export const MAX_INTRA_RUN_GAP_MINUTES = 60;

/**
 * Entry: founding streak must take LONGER than this many minutes to form.
 * Gate compares 1-decimal advisory speed (same as lane_advisory `speed=X.Ym`)
 * via roundAdvisorySpeedMin — so raw 35.04 (displays 35.0) is blocked.
 * Raised 30 → 35 (Jul 24 2026 live autopsy): speed band [30,35] was 1/6 win,
 * −$4.1k actual / pure-book CF +$4.7k if skipped. Arming ceiling stays 45m.
 */
export const ENTRY_SPEED_FLOOR_MIN = 35;

/** Match lane_advisory / CF parsing: speed written as toFixed(1). */
export function roundAdvisorySpeedMin(speedMin: number): number {
  return Number(speedMin.toFixed(1));
}

/** True when advisory-rounded founding speed is at or below the entry floor. */
export function isAtOrBelowEntrySpeedFloor(speedMin: number): boolean {
  return roundAdvisorySpeedMin(speedMin) <= ENTRY_SPEED_FLOOR_MIN;
}

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

/**
 * Exit: peak-favorable-giveback profit lock — additive, checked after the hard
 * stop in the same 30s monitor cycle. Validated Jul 17 2026 research: +74% net
 * pips on the post-freeze live-parity backtest (n=69->70), +76% ($1,798.94) on
 * every real Lane B trade ever placed at these exact values. Does not change
 * opposing-count/share/hard-stop/backstop — purely additive, kill-switched.
 */
export const ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS = 6;
export const ALPHAOMEGA_GIVEBACK_PIPS = 3;
/** When true, the giveback trail is active. Default off — flip via bridge_config. */
export const ALPHAOMEGA_GIVEBACK_TRAIL_ENABLED_CONFIG_KEY = 'alpha_omega_giveback_trail_enabled';

export const PIP_SIZE = 0.0001;

export const ALPHAOMEGA_ENABLED_CONFIG_KEY = 'alpha_omega_enabled';
/** When true, Lane B AO entries size at base risk only (no AMD/news/confluence/graduated). Default off. */
export const ALPHAOMEGA_PURE_SIZING_CONFIG_KEY = 'alpha_omega_pure_sizing';
/** Confluence score that leaves calculateUnits riskPct unscaled (bands are <75 and >=85). */
export const ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE = 80;
/**
 * Fillability guard for pure signal-SL sizing: tiny SLs can request multi‑million
 * units and hit INSUFFICIENT_MARGIN. Cap preserves ~$7k-style book; Lane B AO only.
 */
export const ALPHAOMEGA_PURE_MAX_ABS_UNITS = 3_000_000;
/**
 * Target Asia risk weight (21:00–08:00 UTC). Applied on Lane B AO pure sizing
 * as a post-cap scale: units *= asianWeight / engineWeight (e.g. 0.10/0.25).
 */
export const ALPHAOMEGA_ASIAN_SESSION_WEIGHT = 0.1;

export const ALPHAOMEGA_BLOCK_NO_CRACK = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';
export const ALPHAOMEGA_BLOCK_SPEED_FLOOR = 'ALPHAOMEGA_SPEED_FLOOR';
export const ALPHAOMEGA_BLOCK_ALREADY_OPEN = 'ALPHAOMEGA_ALREADY_OPEN';

/**
 * signals.execution_tier written by engine-omega when bridge exec-dedup skips
 * a matched fire. Bridge observes for AO streak/exits/entry only — never Trail.
 * Must stay in sync with engine-omega signalEmitter AO_OBSERVE_EXECUTION_TIER.
 */
export const ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER = 'ao_observe';

/** bridge_trade_log block_reason for observe-only (no Omega Trail attempt). */
export const ALPHAOMEGA_OBSERVE_DEDUPED_REASON = 'AO_OBSERVE_DEDUPED';

export const ALPHAOMEGA_CLOSE_OPPOSING_COUNT = 'alphaomega_opposing_count';
export const ALPHAOMEGA_CLOSE_OPPOSING_SHARE = 'alphaomega_opposing_share';
export const ALPHAOMEGA_CLOSE_HARD_STOP = 'alphaomega_hard_stop';
export const ALPHAOMEGA_CLOSE_BACKSTOP_CRACK = 'alphaomega_backstop_crack';
export const ALPHAOMEGA_CLOSE_PEAK_GIVEBACK_TRAIL = 'alphaomega_peak_giveback_trail';

export function isOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  if (!brokerId) return false;
  return (OMEGA_AO_BROKER_IDS as readonly string[]).includes(brokerId);
}
