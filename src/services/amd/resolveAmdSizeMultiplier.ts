/**
 * Resolve amd_size_multiplier for engine_amd position sizing.
 * Invalid / missing values fall back to 1.0 (no change).
 */
export function resolveAmdSizeMultiplier(rawMultiplier: unknown): number {
  const parsed = Number(rawMultiplier);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1.0;
  return parsed;
}

/** Effective weight fed to calculateUnits: engine weight × AMD size multiplier. */
export function amdEffectiveEngineWeight(
  engineWeight: number,
  sizeMultiplier: number,
): number {
  return engineWeight * resolveAmdSizeMultiplier(sizeMultiplier);
}

export function computeAmdRiskAmount(
  equity: number,
  engineWeight: number,
  sizeMultiplier: number,
  baselineRiskPct: number,
): number {
  return (
    equity *
    amdEffectiveEngineWeight(engineWeight, sizeMultiplier) *
    baselineRiskPct
  );
}
