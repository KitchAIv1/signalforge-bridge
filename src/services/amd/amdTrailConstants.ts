/**
 * ENGINE_AMD exit constants — isolated from Omega trail (R-based) and other engines.
 * Override via AMD_PIP_TRAIL_PIPS env for rollback without code deploy.
 */

const DEFAULT_TRAIL_PIPS = 5;

function parseEnvTrailPips(): number | null {
  const raw = process.env.AMD_PIP_TRAIL_PIPS?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** S0/S1 pip trail distance from peak favorable price (15 pip hard SL unchanged). */
export const AMD_PIP_TRAIL_PIPS = parseEnvTrailPips() ?? DEFAULT_TRAIL_PIPS;

export const AMD_HARD_SL_PIPS = 15;

// --- Exit stack recalibration (migration 072, all kill-switched) ---
// Thresholds from 49-trade live replay on OANDA M5 paths; see
// scripts/amdDeadTradeAbortGrid.ts and scripts/amdTrailWidthGridSim.ts.

/** Dead-trade abort: hold >= 60m with MFE < 4p -> close. 15/15 such live trades lost. */
export const AMD_DEAD_TRADE_ABORT_CHECK_MINUTES = 60;
export const AMD_DEAD_TRADE_ABORT_ARM_PIPS = 4;
export const AMD_CLOSE_DEAD_TRADE_ABORT = 'dead_trade_abort';
export const AMD_DEAD_TRADE_ABORT_ENABLED_CONFIG_KEY = 'amd_dead_trade_abort_enabled';

/** Trail split: arm at 6p peak gain, exit 4p behind peak (replay optimum, robust across arm 4-6). */
export const AMD_TRAIL_ARM_PIPS = 6;
export const AMD_TRAIL_GIVEBACK_PIPS = 4;
export const AMD_TRAIL_SPLIT_ENABLED_CONFIG_KEY = 'amd_trail_split_enabled';

/** Hard SL override (new trades only): broker SL + sizing denominator. */
export const AMD_HARD_SL_PIPS_CONFIG_KEY = 'amd_hard_sl_pips';
