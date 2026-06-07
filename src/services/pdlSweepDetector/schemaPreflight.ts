import type { SupabaseClient } from '@supabase/supabase-js';
import { PDL_SWEEP_PAIR } from './pdlSweepConstants.js';

export type SchemaPreflightResult = { ok: true } | { ok: false; reason: string };

export async function runSchemaPreflight(supabase: SupabaseClient): Promise<SchemaPreflightResult> {
  const { error: decisionErr } = await supabase
    .from('amd_state')
    .select('decision_auto_direction, auto_direction, auto_direction_confidence, chart_data, evaluated_at')
    .eq('pair', PDL_SWEEP_PAIR)
    .limit(1);
  if (decisionErr) {
    return { ok: false, reason: `amd_state columns probe failed: ${decisionErr.message}` };
  }

  const { error: asianErr } = await supabase
    .from('asian_m5_candles')
    .select('trade_date, pair, candles, candle_count, fetch_status')
    .limit(1);
  if (asianErr) {
    return { ok: false, reason: `asian_m5_candles probe failed: ${asianErr.message}` };
  }

  const { error: tableErr } = await supabase
    .from('pdl_sweep_signals')
    .select('id')
    .limit(1);
  if (tableErr) {
    return { ok: false, reason: `pdl_sweep_signals table missing: ${tableErr.message}` };
  }

  console.log('[PdlSweep] schema preflight OK — evaluated_at (not amd_evaluated_at) for detection guard');
  return { ok: true };
}
