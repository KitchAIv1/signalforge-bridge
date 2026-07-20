/**
 * Lane B ALPHAOMEGA-only position size: equity × weight × riskPct / signal SL.
 * Ignores AMD, news, confluence ±, and graduated consecutive-loss cuts.
 * Abs units capped (ALPHAOMEGA_PURE_MAX_ABS_UNITS) so sub‑4p cracks still fill.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateUnits } from '../positionSizer.js';
import { logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_PURE_MAX_ABS_UNITS,
  ALPHAOMEGA_PURE_SIZING_CONFIG_KEY,
  ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE,
} from './alphaOmegaConstants.js';

export interface AlphaOmegaPureSizeParams {
  routeEquity: number;
  engineWeight: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  instrument: string;
  direction: string;
  capitalAllocationPct: number;
  conversionRate?: number;
  slPipsOverride?: number;
}

/** Safe default: missing/invalid config → false (legacy Omega-inherited sizing). */
export async function isAlphaOmegaPureSizingEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_PURE_SIZING_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

/** Cap absolute units; preserves sign. Pure Lane B AO only (callers of this module). */
export function clampAlphaOmegaPureUnits(
  signedUnits: number,
  maxAbsUnits: number = ALPHAOMEGA_PURE_MAX_ABS_UNITS,
): number {
  const absUnits = Math.abs(signedUnits);
  if (absUnits <= maxAbsUnits) return signedUnits;
  return signedUnits < 0 ? -maxAbsUnits : maxAbsUnits;
}

export function sizeAlphaOmegaPureUnits(params: AlphaOmegaPureSizeParams): number {
  const alloc = params.capitalAllocationPct > 0 ? params.capitalAllocationPct : 1;
  const unitCount = calculateUnits({
    equity: params.routeEquity,
    engineWeight: params.engineWeight * alloc,
    riskPct: params.riskPct,
    entry: params.entry,
    stopLoss: params.stopLoss,
    instrument: params.instrument,
    consecutiveLosses: 0,
    graduatedThreshold: Number.MAX_SAFE_INTEGER,
    confluenceScore: ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE,
    conversionRate: params.conversionRate,
    slPipsOverride: params.slPipsOverride,
  });
  const signed =
    params.direction.toUpperCase() === 'LONG' ? unitCount : -unitCount;
  const clamped = clampAlphaOmegaPureUnits(signed);
  if (clamped !== signed) {
    logWarn('[AlphaOmega] Pure units capped for fillability', {
      uncappedUnits: signed,
      cappedUnits: clamped,
      maxAbsUnits: ALPHAOMEGA_PURE_MAX_ABS_UNITS,
    });
  }
  return clamped;
}

export function withPureSizingAdvisory(laneAdvisory: string): string {
  if (laneAdvisory.includes('sizing=pure')) return laneAdvisory;
  return `${laneAdvisory}:sizing=pure`;
}

export function isAlphaOmegaEntryAdvisory(
  laneAdvisory: string | null | undefined,
): boolean {
  return (laneAdvisory ?? '').startsWith('ALPHAOMEGA_ENTRY:');
}
