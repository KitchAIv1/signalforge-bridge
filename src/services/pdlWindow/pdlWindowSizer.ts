import { calculateUnits } from '../../core/positionSizer.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  PDL_WINDOW_ENGINE_ID,
  PDL_WINDOW_HARD_SL_PIPS,
  PDL_WINDOW_PAIR,
  pdlWindowRiskPct,
} from './pdlWindowConstants.js';

export async function loadPdlWindowEngineWeight(): Promise<number> {
  const { data, error } = await getSupabaseClient()
    .from('bridge_engines')
    .select('weight')
    .eq('engine_id', PDL_WINDOW_ENGINE_ID)
    .maybeSingle();
  if (error || data?.weight == null) return 0.1;
  const weight = Number(data.weight);
  return Number.isFinite(weight) && weight > 0 ? weight : 0.1;
}

export function calculatePdlWindowUnits(
  equity: number,
  weight: number,
  entryPrice: number,
  hardSlPrice: number,
): number {
  return calculateUnits({
    equity,
    engineWeight: weight,
    riskPct: pdlWindowRiskPct(),
    entry: entryPrice,
    stopLoss: hardSlPrice,
    instrument: PDL_WINDOW_PAIR,
    consecutiveLosses: 0,
    graduatedThreshold: 999,
    confluenceScore: 75,
    slPipsOverride: PDL_WINDOW_HARD_SL_PIPS,
  });
}
