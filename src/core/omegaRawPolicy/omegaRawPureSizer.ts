/**
 * RAW Omega pure sizing — equity × weight × riskPct / SL.
 * Ignores AMD, news, confluence ±, and graduated consecutive-loss cuts.
 * Omega-only; other engines untouched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateUnits } from '../positionSizer.js';
import {
  OMEGA_RAW_PURE_SIZING_CONFIG_KEY,
  OMEGA_RAW_PURE_SIZING_NEUTRAL_CONFLUENCE,
} from './omegaRawConstants.js';

export interface OmegaRawPureSizeParams {
  equity: number;
  engineWeight: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  instrument: string;
  direction: string;
  /** Broker route capital share; default 1 (full). */
  capitalAllocationPct?: number;
  conversionRate?: number;
  slPipsOverride?: number;
}

/** Safe default: missing/invalid config → false (legacy overlay sizing). */
export async function isOmegaRawPureSizingEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', OMEGA_RAW_PURE_SIZING_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

export function sizeOmegaRawPureUnits(params: OmegaRawPureSizeParams): number {
  const alloc =
    params.capitalAllocationPct != null && params.capitalAllocationPct > 0
      ? params.capitalAllocationPct
      : 1;
  const unitCount = calculateUnits({
    equity: params.equity,
    engineWeight: params.engineWeight * alloc,
    riskPct: params.riskPct,
    entry: params.entry,
    stopLoss: params.stopLoss,
    instrument: params.instrument,
    consecutiveLosses: 0,
    graduatedThreshold: Number.MAX_SAFE_INTEGER,
    confluenceScore: OMEGA_RAW_PURE_SIZING_NEUTRAL_CONFLUENCE,
    conversionRate: params.conversionRate,
    slPipsOverride: params.slPipsOverride,
  });
  return params.direction.toUpperCase() === 'LONG' ? unitCount : -unitCount;
}
