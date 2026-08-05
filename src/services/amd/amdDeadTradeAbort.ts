/**
 * ENGINE_AMD dead-trade abort — pure decision logic.
 * A trade that is >= 60 minutes old and has never reached 4 pips of
 * favorable movement cannot arm the pip trail; on the live book 15/15
 * such trades lost (-197.3p / -$15,292, 2026-05-28..08-04). Closing them
 * at the 60-minute check caps the bleed near -2..-5p instead of -15p.
 * Additive exit: monitor runs it LAST, after time gate and pip trail.
 * Mirrors the alphaOmegaDeadCrackAbort.ts pure-function pattern; AMD-only,
 * no shared code with AO.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AMD_CLOSE_DEAD_TRADE_ABORT,
  AMD_DEAD_TRADE_ABORT_ARM_PIPS,
  AMD_DEAD_TRADE_ABORT_CHECK_MINUTES,
  AMD_DEAD_TRADE_ABORT_ENABLED_CONFIG_KEY,
} from './amdTrailConstants.js';

const PIP_SIZE = 0.0001;

export interface AmdDeadTradeAbortInput {
  direction: 'long' | 'short';
  fillPrice: number;
  /** Best favorable price since fill (amd_trail_stop_state.peak_favorable_price). */
  peakFavorablePrice: number;
  /** ISO timestamp the trail state row was created (trade open). */
  createdAt: string;
  /** Evaluation clock — inject in tests; defaults to now. */
  asOfMs?: number;
}

export interface AmdDeadTradeAbortResult {
  holdMinutes: number;
  peakGainPips: number;
  /** Predicate matched (independent of the kill switch). */
  shouldAbort: boolean;
  abortReason: typeof AMD_CLOSE_DEAD_TRADE_ABORT | null;
}

/** Peak favorable excursion in pips, from the monitor-tracked peak price. */
export function amdPeakGainPips(
  direction: 'long' | 'short',
  fillPrice: number,
  peakFavorablePrice: number,
): number {
  const move =
    direction === 'long'
      ? peakFavorablePrice - fillPrice
      : fillPrice - peakFavorablePrice;
  return move / PIP_SIZE;
}

/**
 * Single pure decision: hold >= 60m AND peak gain < 4p -> abort.
 * Uses the same MFE definition as the validating replay (mid-price peak
 * vs fill), tracked every 30s by the trail monitor.
 */
export function evaluateAmdDeadTradeAbort(
  input: AmdDeadTradeAbortInput,
): AmdDeadTradeAbortResult {
  const asOfMs = input.asOfMs ?? Date.now();
  const holdMinutes = (asOfMs - Date.parse(input.createdAt)) / 60_000;
  const peakGainPips = amdPeakGainPips(
    input.direction,
    input.fillPrice,
    input.peakFavorablePrice,
  );
  const shouldAbort =
    holdMinutes >= AMD_DEAD_TRADE_ABORT_CHECK_MINUTES &&
    peakGainPips < AMD_DEAD_TRADE_ABORT_ARM_PIPS;
  return {
    holdMinutes,
    peakGainPips,
    shouldAbort,
    abortReason: shouldAbort ? AMD_CLOSE_DEAD_TRADE_ABORT : null,
  };
}

/** Compact forensics line for shadow (would_abort) and real abort logs. */
export function formatAmdDeadTradeAdvisory(
  result: AmdDeadTradeAbortResult,
  mode: 'would_abort' | 'abort',
): string {
  return (
    `AMD_DEAD_TRADE:${mode}:hold=${result.holdMinutes.toFixed(0)}m` +
    `:mfe=${result.peakGainPips.toFixed(1)}p`
  );
}

/** Defaults to false on missing row/error — safe by construction. */
export async function isAmdDeadTradeAbortEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', AMD_DEAD_TRADE_ABORT_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}
