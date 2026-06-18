/**
 * Omega Raw Mode gate helpers.
 * When omega_raw_mode = true in bridge_config, certain engine-level gates are
 * bypassed so the DTW-matched signal executes direction-as-fired with no
 * direction override, no execution_threshold check, no inverse split, and no
 * window expiry gate.
 *
 * Always active regardless of raw mode:
 *   - validateSignal (4-pip minimum, schema)
 *   - News filter (getNewsWindowEvent)
 *   - Circuit breaker
 *   - Opposing open omega position guard
 */

export function parseOmegaRawModeFlag(configValue: unknown): boolean {
  return configValue === true || configValue === 'true';
}

export function isOmegaRaw(engineId: string, rawMode: boolean): boolean {
  return engineId === 'omega' && rawMode;
}

export function shouldBypassIsActive(engineId: string, rawMode: boolean): boolean {
  return isOmegaRaw(engineId, rawMode);
}

export function shouldBypassInverseSplit(engineId: string, rawMode: boolean): boolean {
  return isOmegaRaw(engineId, rawMode);
}

export function shouldBypassExecutionThreshold(engineId: string, rawMode: boolean): boolean {
  return isOmegaRaw(engineId, rawMode);
}

export function shouldBypassDirectionFlip(engineId: string, rawMode: boolean): boolean {
  return isOmegaRaw(engineId, rawMode);
}

export function shouldBypassWindowGate(engineId: string, rawMode: boolean): boolean {
  return isOmegaRaw(engineId, rawMode);
}
