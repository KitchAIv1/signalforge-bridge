/**
 * ALPHAOMEGA Lane B peak-favorable-giveback profit lock — pure decision logic.
 * Additive exit: runs alongside (never replaces) opposing-count/opposing-share/
 * hard-stop/backstop. Validated Jul 17 2026 (scripts/aoOpposingGivebackTest,
 * scripts/aoQuantAudit3d): +74% net pips on the post-freeze live-parity
 * backtest, +76% ($1,798.94) on every real Lane B trade ever placed, at these
 * exact activation/giveback values. Kept as pure functions (no I/O) — mirrors
 * the alphaOmegaEntryGate.ts split between decision logic and its callers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LatestM5Candle } from '../../connectors/oanda.js';
import {
  ALPHAOMEGA_CLOSE_PEAK_GIVEBACK_TRAIL,
  ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS,
  ALPHAOMEGA_GIVEBACK_PIPS,
  ALPHAOMEGA_GIVEBACK_TRAIL_ENABLED_CONFIG_KEY,
  PIP_SIZE,
} from './alphaOmegaConstants.js';
import type { AlphaOmegaDirection } from './alphaOmegaStreakTracker.js';

export interface GivebackTrailInput {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  peakFavorablePips: number;
}

export interface GivebackTrailResult {
  /** Peak favorable pips after folding in this candle — always >= input peak. */
  nextPeakFavorablePips: number;
  shouldExit: boolean;
  exitReason: typeof ALPHAOMEGA_CLOSE_PEAK_GIVEBACK_TRAIL | null;
}

/** Favorable-side extreme of this candle (the side that would extend the peak). */
export function favorablePipsFromCandle(
  direction: AlphaOmegaDirection,
  entryPrice: number,
  candle: LatestM5Candle,
): number {
  const price = direction === 'LONG' ? candle.high : candle.low;
  const move = direction === 'LONG' ? price - entryPrice : entryPrice - price;
  return move / PIP_SIZE;
}

/** Worst retracement from the peak visible in this candle (the adverse side). */
export function adverseFromPeakPips(
  direction: AlphaOmegaDirection,
  entryPrice: number,
  peakFavorablePips: number,
  candle: LatestM5Candle,
): number {
  const worstPrice = direction === 'LONG' ? candle.low : candle.high;
  const worstFavorablePips =
    direction === 'LONG' ? (worstPrice - entryPrice) / PIP_SIZE : (entryPrice - worstPrice) / PIP_SIZE;
  return peakFavorablePips - worstFavorablePips;
}

/**
 * Single pure decision: given the position's current known peak and the
 * latest candle, decide whether the trail should exit and what the fresh
 * peak is (to persist either way, since the peak advances even when it
 * doesn't yet trigger an exit).
 */
export function evaluateGivebackTrail(
  input: GivebackTrailInput,
  candle: LatestM5Candle,
): GivebackTrailResult {
  const { direction, entryPrice, peakFavorablePips } = input;

  if (peakFavorablePips >= ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS) {
    const retracement = adverseFromPeakPips(direction, entryPrice, peakFavorablePips, candle);
    if (retracement >= ALPHAOMEGA_GIVEBACK_PIPS) {
      return {
        nextPeakFavorablePips: peakFavorablePips,
        shouldExit: true,
        exitReason: ALPHAOMEGA_CLOSE_PEAK_GIVEBACK_TRAIL,
      };
    }
  }

  const candleFavorable = favorablePipsFromCandle(direction, entryPrice, candle);
  return {
    nextPeakFavorablePips: Math.max(peakFavorablePips, candleFavorable),
    shouldExit: false,
    exitReason: null,
  };
}

/** Defaults to false on missing row/error — safe by construction, matches isAlphaOmegaPureSizingEnabled. */
export async function isAlphaOmegaGivebackTrailEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_GIVEBACK_TRAIL_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}
