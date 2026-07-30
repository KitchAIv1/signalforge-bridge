import { getSupabaseClient } from '../../connectors/supabase.js';
import { isFreshPdlDetection } from '../pdlSweepDetector/pdlDetectionFreshness.js';
import { PDL_SWEEP_PAIR, PDL_SWEEP_TABLE } from '../pdlSweepDetector/pdlSweepConstants.js';
import type { PdlWindowConditionsMet, PdlWindowDirection } from './pdlWindowTypes.js';

export type PdlWindowDaySignal = {
  conditions: PdlWindowConditionsMet;
  shouldTrade: boolean;
  direction: PdlWindowDirection;
};

function parseConditions(raw: unknown): PdlWindowConditionsMet | null {
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.pdl_breach !== 'boolean' ||
    typeof row.london_down !== 'boolean' ||
    typeof row.h11_up !== 'boolean'
  ) {
    return null;
  }
  return {
    pdl_breach: row.pdl_breach,
    london_down: row.london_down,
    h11_up: row.h11_up,
  };
}

/** Always trade once conditions are known. */
export function shouldTradeFromConditions(_conditions: PdlWindowConditionsMet): boolean {
  return true;
}

/**
 * SHORT when all-false (XXX) or all-true (P1L1H1); LONG otherwise.
 */
export function directionFromConditions(
  conditions: PdlWindowConditionsMet,
): PdlWindowDirection {
  const allFalse =
    !conditions.pdl_breach && !conditions.london_down && !conditions.h11_up;
  const allTrue =
    conditions.pdl_breach && conditions.london_down && conditions.h11_up;
  return allFalse || allTrue ? 'short' : 'long';
}

/** Load today's detection row only if evaluated after 12:00 UTC (11:55 closed). */
export async function loadTodayPdlWindowSignal(
  tradeDate: string,
): Promise<PdlWindowDaySignal | null> {
  const { data, error } = await getSupabaseClient()
    .from(PDL_SWEEP_TABLE)
    .select('conditions_met, evaluated_at')
    .eq('pair', PDL_SWEEP_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();

  if (error) {
    console.error('[PdlWindow] loadTodayPdlWindowSignal failed:', error.message);
    return null;
  }
  if (!data) return null;

  if (!isFreshPdlDetection(tradeDate, data.evaluated_at as string | null)) {
    console.warn('[PdlWindow] detection not fresh after 12:00 UTC — skip entry');
    return null;
  }

  const conditions = parseConditions(data.conditions_met);
  if (!conditions) return null;
  return {
    conditions,
    shouldTrade: shouldTradeFromConditions(conditions),
    direction: directionFromConditions(conditions),
  };
}
