import type { ConditionsMet } from '@/lib/pdlSweepTypes';
import { PDL_WINDOW_VT_SPREAD_PIPS } from '@/lib/pdlSweepConstants';

export type PdlLiveSide = 'long' | 'short';

/** SHORT when all-false or all-true; LONG otherwise. */
export function pdlLiveSideFromConditions(conditions: ConditionsMet): PdlLiveSide {
  const allFalse =
    !conditions.pdl_breach && !conditions.london_down && !conditions.h11_up;
  const allTrue =
    conditions.pdl_breach && conditions.london_down && conditions.h11_up;
  return allFalse || allTrue ? 'short' : 'long';
}

/** Signed H12 body-sum under live side, then −VT spread (research proxy). */
export function researchNetPipsForSide(
  side: PdlLiveSide,
  outcomeH12NetPips: number | null,
): number | null {
  if (outcomeH12NetPips == null) return null;
  const gross = side === 'short' ? -outcomeH12NetPips : outcomeH12NetPips;
  return Math.round((gross - PDL_WINDOW_VT_SPREAD_PIPS) * 10) / 10;
}

export function normalizeTradeDateKey(tradeDate: string): string {
  return tradeDate.slice(0, 10);
}
