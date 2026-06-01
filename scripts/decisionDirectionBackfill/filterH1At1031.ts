import type { OhlcCandle } from '../../src/services/amdDetector/amdFeatures.js';

/** Exclude H1 bars with UTC open hour >= 10 — faithful live 10:31 reconstruction. */
export function filterH1CandlesBeforeDistribution(
  h1Raw: OhlcCandle[],
): OhlcCandle[] {
  return h1Raw.filter((candle) => new Date(candle.time).getUTCHours() < 10);
}

export function isSuspicious1031Tag(amdTag: string): boolean {
  return amdTag === 'AMD_TEXTBOOK' || amdTag === 'AMD_COMPRESSION_BREAKOUT';
}
