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

/**
 * CF-C drop band: advisory founding speed in (45, 60] minutes.
 * Live keep bands are (35, 45] and >60; floor already blocks ≤35.
 * Lower bound reuses ENTRY_SPEED_CEILING_MIN (45) for arming/CF parity.
 */
export const ENTRY_SPEED_MID_BAND_MAX_MIN = 60;

/** True when advisory-rounded speed is in the losing mid-band (45, 60]. */
export function isInAlphaOmegaDroppedSpeedMidBand(speedMin: number): boolean {
  const advisorySpeed = roundAdvisorySpeedMin(speedMin);
  return (
    advisorySpeed > ENTRY_SPEED_CEILING_MIN &&
    advisorySpeed <= ENTRY_SPEED_MID_BAND_MAX_MIN
  );
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
/**
 * Unarmed streak age-out hygiene (>45m from start → reset). Default ON when
 * missing. Set false in bridge_config to kill without redeploy.
 */
export const ALPHAOMEGA_UNARMED_AGEOUT_ENABLED_CONFIG_KEY =
  'alpha_omega_unarmed_ageout_enabled';
/** When true, Lane B AO entries size at base risk only (no AMD/news/confluence/graduated). Default off. */
export const ALPHAOMEGA_PURE_SIZING_CONFIG_KEY = 'alpha_omega_pure_sizing';
/**
 * When true, place-only skip for shallow+refuse toxic cracks.
 * Default off — flip via bridge_config / dashboard toggle; no redeploy.
 */
export const ALPHAOMEGA_TOXIC_CRACK_SKIP_ENABLED_CONFIG_KEY =
  'alpha_omega_toxic_crack_skip_enabled';
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

/**
 * AO new-entry blackout: [21:00, 21:15) UTC daily (Asia reopen / rollover).
 * Blocks place only — streak observe and exits stay live.
 */
export const ALPHAOMEGA_ENTRY_BLACKOUT_START_UTC_MIN = 21 * 60;
export const ALPHAOMEGA_ENTRY_BLACKOUT_END_UTC_MIN = 21 * 60 + 15;

export const ALPHAOMEGA_BLOCK_NO_CRACK = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';
export const ALPHAOMEGA_BLOCK_SPEED_FLOOR = 'ALPHAOMEGA_SPEED_FLOOR';
export const ALPHAOMEGA_BLOCK_SPEED_MID_BAND = 'ALPHAOMEGA_SPEED_MID_BAND';
export const ALPHAOMEGA_BLOCK_ALREADY_OPEN = 'ALPHAOMEGA_ALREADY_OPEN';
export const ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT = 'ALPHAOMEGA_ENTRY_BLACKOUT';
/** Place-only: shallow crack on refuse pre-tape (kill-switched). */
export const ALPHAOMEGA_BLOCK_TOXIC_CRACK = 'ALPHAOMEGA_TOXIC_CRACK';
/** Place-only: AMD detector tagged today AMD_FAILED, signal after 10:31 UTC tag write (kill-switched). */
export const ALPHAOMEGA_BLOCK_AMD_DAY_GATE = 'ALPHAOMEGA_AMD_DAY_GATE';

/**
 * signals.execution_tier written by engine-omega when bridge exec-dedup skips
 * a matched fire. Bridge observes for AO streak/exits/entry only — never Trail.
 * Must stay in sync with engine-omega signalEmitter AO_OBSERVE_EXECUTION_TIER.
 */
export const ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER = 'ao_observe';

/**
 * signals.execution_tier for directed over-threshold (>centroid thr) shapes.
 * Shadow AO streak only — never Trail, never live Lane B orders.
 * Must stay in sync with engine-omega AO_SHADOW_OVER_EXECUTION_TIER.
 */
export const ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER = 'ao_shadow_over';

/** Paper Shadow AO broker_id — never join OMEGA_AO_BROKER_IDS. */
export const OMEGA_AO_SHADOW_BROKER_ID = 'ao_shadow_paper';

/** bridge_config kill switch for Shadow AO (default false). */
export const ALPHAOMEGA_SHADOW_ENABLED_CONFIG_KEY = 'alpha_omega_shadow_enabled';

/** bridge_trade_log block_reason for observe-only (no Omega Trail attempt). */
export const ALPHAOMEGA_OBSERVE_DEDUPED_REASON = 'AO_OBSERVE_DEDUPED';

/** bridge_trade_log reason when omega execution_tier is not whitelisted. */
export const ALPHAOMEGA_UNKNOWN_EXECUTION_TIER_REASON = 'AO_UNKNOWN_EXECUTION_TIER';

/** bridge_trade_log reason for over-threshold shadow observe (no orders). */
export const ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON = 'AO_SHADOW_OVER_OBSERVED';

/** lane_advisory prefix for Shadow AO paper entries. */
export const ALPHAOMEGA_SHADOW_ENTRY_ADVISORY_PREFIX = 'ALPHAOMEGA_SHADOW_ENTRY';

export const ALPHAOMEGA_CLOSE_OPPOSING_COUNT = 'alphaomega_opposing_count';
export const ALPHAOMEGA_CLOSE_OPPOSING_SHARE = 'alphaomega_opposing_share';
export const ALPHAOMEGA_CLOSE_HARD_STOP = 'alphaomega_hard_stop';
export const ALPHAOMEGA_CLOSE_BACKSTOP_CRACK = 'alphaomega_backstop_crack';
export const ALPHAOMEGA_CLOSE_PEAK_GIVEBACK_TRAIL = 'alphaomega_peak_giveback_trail';
export const ALPHAOMEGA_CLOSE_DEAD_CRACK_ABORT = 'alphaomega_dead_crack_abort';

/**
 * Dead-crack abort (no-follow-through exit) — additive, kill-switched, checked
 * LAST in the 30s monitor cycle (after hard stop and giveback trail). Aborts a
 * position that is >=30m old, never reached 1.5p favorable, and has been >=3p
 * underwater. Thresholds mirror scripts/aoRefuseTapeCf/walkLiveTradePath.ts
 * (Policy I NFT abort, re-validated Aug 3 2026: +25.2p raw / ~+11p after fill
 * realism on the 53-trade live book; 2 recovering winners clipped, 21 losers cut).
 */
export const ALPHAOMEGA_DEAD_CRACK_MIN_HOLD_MINUTES = 30;
export const ALPHAOMEGA_DEAD_CRACK_MFE_MAX_PIPS = 1.5;
export const ALPHAOMEGA_DEAD_CRACK_MAE_MIN_PIPS = 3;
/** When true, the dead-crack abort closes positions. Default off — flip via bridge_config / dashboard toggle. */
export const ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY =
  'alpha_omega_dead_crack_abort_enabled';

/**
 * AMD-day gate: skip new AO entries on days the AMD detector (10:31 UTC cron)
 * tagged AMD_FAILED — only for signals at/after the tag write time (no
 * look-ahead; pre-tag entries unaffected). 45d causal counterfactual (Aug 2026):
 * AO book -98.3p -> +3.3p; removed fills were 25% winners vs 39% baseline.
 * Fail-open: missing amd_state row or read error = trade normally.
 */
export const ALPHAOMEGA_AMD_DAY_GATE_ENABLED_CONFIG_KEY =
  'alpha_omega_amd_day_gate_enabled';
/** amd_state.amd_tag value that triggers the gate. */
export const ALPHAOMEGA_AMD_DAY_GATE_BLOCKING_TAG = 'AMD_FAILED';

export function isOmegaLaneBBroker(brokerId: string | null | undefined): boolean {
  if (!brokerId) return false;
  return (OMEGA_AO_BROKER_IDS as readonly string[]).includes(brokerId);
}

/** True for Shadow AO paper broker — never route to live OANDA/MT5. */
export function isOmegaAoShadowBroker(brokerId: string | null | undefined): boolean {
  return brokerId === OMEGA_AO_SHADOW_BROKER_ID;
}

/** Synthetic paper ticket ids (`shadow-…`) must never hit broker trade APIs. */
export function isShadowPaperTradeId(tradeId: string | null | undefined): boolean {
  return typeof tradeId === 'string' && tradeId.startsWith('shadow-');
}
