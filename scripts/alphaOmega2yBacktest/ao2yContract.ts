/**
 * Phase 0 — frozen live-parity contract for AlphaOmega 2y backtest.
 * Source of truth cross-check:
 * - DTW: engine-omega/src/shadow/patternMatcher.ts (w5/c0 freeze 2026-06-18)
 * - Hour-20: engine-omega/src/shadow/signalEmitter.ts Layer 3A
 * - Entry/exit: src/core/alphaOmega/* + scripts/omegaHardStopExit.ts
 */

export const AO2Y_CONTRACT_VERSION = '2026-07-13.v1';

/** Live w5/c0 cutover — first valid live fire era for Gate A/B. */
export const W5C0_CUTOVER_ISO = '2026-06-18T21:41:45.000Z';

export const AO2Y_PIP_SIZE = 0.0001;
export const AO2Y_EXEC_COST_PIPS = 1.2;

/** Live DTW default p90 threshold (do not override via env in batch). */
export const AO2Y_DTW_THRESHOLD = 7.737647;

export const AO2Y_ENTRY_STREAK = 7;
export const AO2Y_ENTRY_SPEED_CEILING_MIN = 45;
export const AO2Y_ENTRY_SPEED_FLOOR_MIN = 30;
export const AO2Y_MAX_INTRA_RUN_GAP_MINUTES = 60;

export const AO2Y_OPPOSING_COUNT_THRESHOLD = 5;
export const AO2Y_OPPOSING_SHARE_THRESHOLD = 1.0;
export const AO2Y_MIN_FIRES_FOR_SHARE_CHECK = 4;
export const AO2Y_MAX_HOLD_HOURS = 3;
export const AO2Y_HARD_STOP_PIPS = 10;

/** Live Layer 3A — force SHORT during hour 20 UTC. */
export const AO2Y_HOUR20_FORCE_SHORT = true;

/**
 * Bridge ingest lag vs engine candle-close fired_at.
 * Empirically ~60.4s median (signal_received_at − candle close) on gate window.
 */
export const AO2Y_BRIDGE_INGEST_LAG_MS = 60_000;

/**
 * Recent-window stress recipe (must PASS before trusting longer runs):
 * offline DTW direction + snap to live ingest time/price anchors.
 * Live fire stream itself is never modified (source of truth).
 */
export const AO2Y_ALIGN_TO_LIVE_ANCHORS = true;

/**
 * Gate B acceptance band vs corrected short-window book (HS=10):
 * n≈70, net≈+39.0p, WR≈37.1% on live fire stream.
 */
export const GATE_B_TARGET = {
  netPips: 39.0,
  n: 70,
  wrPct: 37.1,
  netTolerancePips: 8,
  nTolerance: 12,
  wrTolerancePct: 8,
} as const;
