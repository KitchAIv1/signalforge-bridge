/**
 * RegimeStateService
 * Reads the latest regime state row for a pair from Supabase.
 * Used by signalRouter before executing omega signals.
 */
import { createClient } from '@supabase/supabase-js';
import type { RegimeDirection, RegimeConfidence } from './regimeDetector/regimeClassifier.js';

export interface ActiveRegimeState {
  direction:      RegimeDirection;
  confidence:     RegimeConfidence;
  evaluatedAt:    string;
  choppyOverride: boolean;
}

const CONFIDENCE_SIZE_MULTIPLIER: Record<RegimeConfidence, number> = {
  HIGH:   1.0,
  MEDIUM: 0.3,
  LOW:    0.0,
  PAUSE:  0.0,
};

export function getRegimeSizeMultiplier(confidence: RegimeConfidence): number {
  return CONFIDENCE_SIZE_MULTIPLIER[confidence] ?? 0.0;
}

export async function fetchLatestRegimeState(
  pair: string
): Promise<ActiveRegimeState | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: regimeRow, error } = await supabase
    .from('regime_state')
    .select('regime_direction, regime_confidence, evaluated_at, choppy_extended_override')
    .eq('pair', pair)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !regimeRow) return null;

  return {
    direction:      regimeRow.regime_direction      as RegimeDirection,
    confidence:     regimeRow.regime_confidence     as RegimeConfidence,
    evaluatedAt:    regimeRow.evaluated_at,
    choppyOverride: regimeRow.choppy_extended_override ?? false,
  };
}
