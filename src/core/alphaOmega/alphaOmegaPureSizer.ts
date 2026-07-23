/**
 * Lane B ALPHAOMEGA-only position size: equity × weight × riskPct / signal SL.
 * Ignores AMD, news, confluence ±, and graduated consecutive-loss cuts.
 * Abs units capped (ALPHAOMEGA_PURE_MAX_ABS_UNITS) so sub‑4p cracks still fill.
 * Asian window (21:00–08:00 UTC): AFTER cap, scale by (0.10 / engineWeight).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateUnits } from '../positionSizer.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_ASIAN_SESSION_WEIGHT,
  ALPHAOMEGA_PURE_MAX_ABS_UNITS,
  ALPHAOMEGA_PURE_SIZING_CONFIG_KEY,
  ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE,
} from './alphaOmegaConstants.js';
import {
  isAlphaOmegaAsianSessionUtc,
  resolveAlphaOmegaAsiaPostCapScale,
} from './resolveAlphaOmegaSessionWeight.js';

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
  /** Defaults to now; inject fixed UTC in tests. */
  asOf?: Date;
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

/** Scale signed units after cap; round to whole units; keep sign; min 1 if non-zero. */
export function applyAsiaPostCapUnitScale(
  signedUnits: number,
  scale: number,
): number {
  if (scale === 1 || signedUnits === 0) return signedUnits;
  const sign = signedUnits < 0 ? -1 : 1;
  const scaled = Math.round(Math.abs(signedUnits) * scale);
  return sign * Math.max(scaled, 1);
}

export function sizeAlphaOmegaPureUnits(params: AlphaOmegaPureSizeParams): number {
  const asOf = params.asOf ?? new Date();
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
  return applyAsiaSessionPostCap(clamped, params.engineWeight, asOf);
}

function applyAsiaSessionPostCap(
  clampedUnits: number,
  engineWeight: number,
  asOf: Date,
): number {
  const scale = resolveAlphaOmegaAsiaPostCapScale(engineWeight, asOf);
  if (scale === 1) return clampedUnits;
  const scaled = applyAsiaPostCapUnitScale(clampedUnits, scale);
  logInfo('[AlphaOmega] Asian session post-cap scale applied', {
    engineWeight,
    asianWeight: ALPHAOMEGA_ASIAN_SESSION_WEIGHT,
    scale,
    utcHour: asOf.getUTCHours(),
    cappedUnits: clampedUnits,
    scaledUnits: scaled,
  });
  return scaled;
}

/** Append sizing=pure; in Asia also asiaW=0.10 (idempotent). */
export function withPureSizingAdvisory(
  laneAdvisory: string,
  asOf: Date = new Date(),
): string {
  let advisory = laneAdvisory;
  if (!advisory.includes('sizing=pure')) {
    advisory = `${advisory}:sizing=pure`;
  }
  if (isAlphaOmegaAsianSessionUtc(asOf) && !advisory.includes('asiaW=')) {
    advisory = `${advisory}:asiaW=${ALPHAOMEGA_ASIAN_SESSION_WEIGHT}`;
  }
  return advisory;
}

export function isAlphaOmegaEntryAdvisory(
  laneAdvisory: string | null | undefined,
): boolean {
  return (laneAdvisory ?? '').startsWith('ALPHAOMEGA_ENTRY:');
}
