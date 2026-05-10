/**
 * Combines layer outputs into a regime decision.
 * Omega-specific confidence: HIGH when H4 opposes D1 trend (retracement entry).
 * Pure function — no I/O, no side effects.
 */
import type { Layer4Result, Layer5Result } from './layerComputation.js';

export type RegimeDirection  = 'LONG' | 'SHORT' | 'PAUSE';
export type RegimeConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'PAUSE';

export interface RegimeOutput {
  direction:              RegimeDirection;
  confidence:             RegimeConfidence;
  choppyExtendedOverride: boolean;
}

export function classifyRegime(
  layer4:        Layer4Result,
  layer5:        Layer5Result,
  layer6PosPct:  number,
  layer5AbsPips: number
): RegimeOutput {
  const base = resolveBaseRegime(layer4, layer5);
  const choppyExtendedOverride = isChoppyExtended(
    layer6PosPct,
    layer5AbsPips,
    base.direction
  );

  if (choppyExtendedOverride) {
    return { direction: 'PAUSE', confidence: 'PAUSE', choppyExtendedOverride: true };
  }

  return { ...base, choppyExtendedOverride: false };
}

function resolveBaseRegime(
  layer4: Layer4Result,
  layer5: Layer5Result
): { direction: RegimeDirection; confidence: RegimeConfidence } {
  if (layer4 === 'TRENDING_UP'   && layer5 === 'BEARISH')
    return { direction: 'LONG',  confidence: 'HIGH' };
  if (layer4 === 'TRENDING_UP'   && layer5 === 'NEUTRAL')
    return { direction: 'LONG',  confidence: 'MEDIUM' };
  if (layer4 === 'TRENDING_UP'   && layer5 === 'BULLISH')
    return { direction: 'LONG',  confidence: 'LOW' };
  if (layer4 === 'TRENDING_DOWN' && layer5 === 'BULLISH')
    return { direction: 'SHORT', confidence: 'HIGH' };
  if (layer4 === 'TRENDING_DOWN' && layer5 === 'NEUTRAL')
    return { direction: 'SHORT', confidence: 'MEDIUM' };
  if (layer4 === 'TRENDING_DOWN' && layer5 === 'BEARISH')
    return { direction: 'SHORT', confidence: 'LOW' };
  return { direction: 'PAUSE', confidence: 'PAUSE' };
}

function isChoppyExtended(
  positionPct:  number,
  absPipDiff:   number,
  direction:    RegimeDirection
): boolean {
  return direction !== 'PAUSE' && positionPct > 70 && absPipDiff < 20;
}
