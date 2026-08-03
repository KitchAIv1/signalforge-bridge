/** Parse ALPHAOMEGA lane_advisory founding geometry. */

export interface FoundingGeometry {
  foundingLength: number;
  foundingSpeedMin: number;
  pureSizing: boolean;
}

export function parseAlphaOmegaAdvisory(advisory: string | null | undefined): FoundingGeometry {
  const text = advisory ?? '';
  const foundingLength = Number(text.match(/len=(\d+)/)?.[1] ?? NaN);
  const foundingSpeedMin = Number(text.match(/speed=([\d.]+)m/)?.[1] ?? NaN);
  return {
    foundingLength: Number.isFinite(foundingLength) ? foundingLength : 0,
    foundingSpeedMin: Number.isFinite(foundingSpeedMin) ? foundingSpeedMin : 0,
    pureSizing: text.includes('sizing=pure'),
  };
}

export function signalStopPips(fillPrice: number, stopLoss: number | null): number | null {
  if (stopLoss == null || !Number.isFinite(stopLoss)) return null;
  return Math.round(Math.abs(fillPrice - stopLoss) * 10000 * 10) / 10;
}
