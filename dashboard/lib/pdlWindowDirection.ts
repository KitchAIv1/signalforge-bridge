import type { ConditionsMet } from '@/lib/pdlSweepTypes';

export type PdlLiveSide = 'long' | 'short';

/** SHORT when all-false or all-true; LONG otherwise. */
export function pdlLiveSideFromConditions(conditions: ConditionsMet): PdlLiveSide {
  const allFalse =
    !conditions.pdl_breach && !conditions.london_down && !conditions.h11_up;
  const allTrue =
    conditions.pdl_breach && conditions.london_down && conditions.h11_up;
  return allFalse || allTrue ? 'short' : 'long';
}
