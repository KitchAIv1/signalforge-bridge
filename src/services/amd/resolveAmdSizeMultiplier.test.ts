import { describe, expect, it } from 'vitest';
import {
  amdEffectiveEngineWeight,
  computeAmdRiskAmount,
  resolveAmdSizeMultiplier,
} from './resolveAmdSizeMultiplier.js';

describe('resolveAmdSizeMultiplier', () => {
  it('returns finite positive multipliers unchanged', () => {
    expect(resolveAmdSizeMultiplier(0.25)).toBe(0.25);
    expect(resolveAmdSizeMultiplier(1.75)).toBe(1.75);
    expect(resolveAmdSizeMultiplier('0.5')).toBe(0.5);
  });

  it('falls back to 1.0 for null, zero, negative, or non-finite', () => {
    expect(resolveAmdSizeMultiplier(null)).toBe(1.0);
    expect(resolveAmdSizeMultiplier(undefined)).toBe(1.0);
    expect(resolveAmdSizeMultiplier(0)).toBe(1.0);
    expect(resolveAmdSizeMultiplier(-1)).toBe(1.0);
    expect(resolveAmdSizeMultiplier(Number.NaN)).toBe(1.0);
  });
});

describe('amdEffectiveEngineWeight', () => {
  it('multiplies engine weight by size multiplier', () => {
    expect(amdEffectiveEngineWeight(1.0, 0.25)).toBe(0.25);
    expect(amdEffectiveEngineWeight(0.5, 1.75)).toBe(0.875);
  });
});

describe('computeAmdRiskAmount', () => {
  it('scales risk by weight and size multiplier', () => {
    expect(computeAmdRiskAmount(100_000, 1.0, 0.25, 0.02)).toBe(500);
    expect(computeAmdRiskAmount(100_000, 1.0, 1.75, 0.02)).toBe(3500);
  });
});
