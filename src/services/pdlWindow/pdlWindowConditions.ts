import { getSupabaseClient } from '../../connectors/supabase.js';
import { PDL_SWEEP_PAIR, PDL_SWEEP_TABLE } from '../pdlSweepDetector/pdlSweepConstants.js';
import type { PdlWindowConditionsMet } from './pdlWindowTypes.js';

export type PdlWindowDaySignal = {
  conditions: PdlWindowConditionsMet;
  shouldTrade: boolean;
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

/** Skip only when all three conditions are false. */
export function shouldTradeFromConditions(conditions: PdlWindowConditionsMet): boolean {
  return conditions.pdl_breach || conditions.london_down || conditions.h11_up;
}

/** Load today's shadow detection row written at 12:10 UTC. */
export async function loadTodayPdlWindowSignal(
  tradeDate: string,
): Promise<PdlWindowDaySignal | null> {
  const { data, error } = await getSupabaseClient()
    .from(PDL_SWEEP_TABLE)
    .select('conditions_met')
    .eq('pair', PDL_SWEEP_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();

  if (error) {
    console.error('[PdlWindow] loadTodayPdlWindowSignal failed:', error.message);
    return null;
  }
  if (!data) return null;

  const conditions = parseConditions(data.conditions_met);
  if (!conditions) return null;
  return { conditions, shouldTrade: shouldTradeFromConditions(conditions) };
}
