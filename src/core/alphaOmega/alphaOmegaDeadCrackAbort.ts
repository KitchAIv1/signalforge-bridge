/**
 * ALPHAOMEGA dead-crack abort (no-follow-through exit) — pure decision logic.
 * Additive exit: runs alongside (never replaces) opposing-count/opposing-share/
 * hard-stop/backstop/giveback. A position that is >=30m old, never reached
 * 1.5p favorable, and has been >=3p underwater is "dead" — 0/18 such trades
 * won on the live book (Jul 10 – Aug 3 2026). Thresholds and fold-then-check
 * order mirror scripts/aoRefuseTapeCf/walkLiveTradePath.ts exactly.
 * Pure functions (no I/O) — mirrors the alphaOmegaGivebackTrail.ts split.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LatestM5Candle } from '../../connectors/oanda.js';
import {
  ALPHAOMEGA_CLOSE_DEAD_CRACK_ABORT,
  ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY,
  ALPHAOMEGA_DEAD_CRACK_MAE_MIN_PIPS,
  ALPHAOMEGA_DEAD_CRACK_MFE_MAX_PIPS,
  ALPHAOMEGA_DEAD_CRACK_MIN_HOLD_MINUTES,
  PIP_SIZE,
} from './alphaOmegaConstants.js';
import { favorablePipsFromCandle } from './alphaOmegaGivebackTrail.js';
import type { AlphaOmegaDirection } from './alphaOmegaStreakTracker.js';

export interface DeadCrackAbortInput {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  /** ISO timestamp of the entry fire (position_state.entry_fired_at). */
  entryFiredAt: string;
  /** Running best favorable excursion (pips) persisted across cycles. */
  peakFavorablePips: number;
  /** Running worst adverse excursion (pips) persisted across cycles. */
  troughAdversePips: number;
  /** Evaluation clock — inject in tests; defaults to now. */
  asOfMs?: number;
}

export interface DeadCrackAbortResult {
  holdMinutes: number;
  /** Peak after folding in this candle — always >= input peak. Persist when grown. */
  nextPeakFavorablePips: number;
  /** Trough after folding in this candle — always >= input trough. Persist when grown. */
  nextTroughAdversePips: number;
  /** Predicate matched (independent of the kill switch). */
  shouldAbort: boolean;
  abortReason: typeof ALPHAOMEGA_CLOSE_DEAD_CRACK_ABORT | null;
}

/** Adverse-side extreme of this candle (the side that would extend the trough). */
export function adversePipsFromCandle(
  direction: AlphaOmegaDirection,
  entryPrice: number,
  candle: LatestM5Candle,
): number {
  const price = direction === 'LONG' ? candle.low : candle.high;
  const move = direction === 'LONG' ? entryPrice - price : price - entryPrice;
  return move / PIP_SIZE;
}

/**
 * Single pure decision: fold this candle into the running MFE/MAE FIRST, then
 * check hold >= 30m && MFE < 1.5p && MAE >= 3p (same order as the CF walker).
 * Returns fresh extremes to persist either way — they advance even when the
 * abort doesn't trigger, keeping the running path truthful across cycles.
 */
export function evaluateDeadCrackAbort(
  input: DeadCrackAbortInput,
  candle: LatestM5Candle,
): DeadCrackAbortResult {
  const asOfMs = input.asOfMs ?? Date.now();
  const holdMinutes = (asOfMs - Date.parse(input.entryFiredAt)) / 60_000;

  const nextPeakFavorablePips = Math.max(
    input.peakFavorablePips,
    favorablePipsFromCandle(input.direction, input.entryPrice, candle),
  );
  const nextTroughAdversePips = Math.max(
    input.troughAdversePips,
    adversePipsFromCandle(input.direction, input.entryPrice, candle),
  );

  const shouldAbort =
    holdMinutes >= ALPHAOMEGA_DEAD_CRACK_MIN_HOLD_MINUTES &&
    nextPeakFavorablePips < ALPHAOMEGA_DEAD_CRACK_MFE_MAX_PIPS &&
    nextTroughAdversePips >= ALPHAOMEGA_DEAD_CRACK_MAE_MIN_PIPS;

  return {
    holdMinutes,
    nextPeakFavorablePips,
    nextTroughAdversePips,
    shouldAbort,
    abortReason: shouldAbort ? ALPHAOMEGA_CLOSE_DEAD_CRACK_ABORT : null,
  };
}

/** Compact forensics line for shadow (would_abort) and real abort logs. */
export function formatDeadCrackAdvisory(
  result: DeadCrackAbortResult,
  mode: 'would_abort' | 'abort',
): string {
  return (
    `ALPHAOMEGA_DEAD_CRACK:${mode}:hold=${result.holdMinutes.toFixed(0)}m` +
    `:mfe=${result.nextPeakFavorablePips.toFixed(1)}p` +
    `:mae=${result.nextTroughAdversePips.toFixed(1)}p`
  );
}

/** Defaults to false on missing row/error — safe by construction, matches isAlphaOmegaGivebackTrailEnabled. */
export async function isAlphaOmegaDeadCrackAbortEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_DEAD_CRACK_ABORT_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}
