/** Live fill lookup keys — normalize to M5 bar + direction. */

import type { LiveFillRecord, TradeDirection } from '../../src/services/omegaReplay/types.js';

const BAR_MS = 5 * 60 * 1000;

export function m5BucketKey(firedAtIso: string, direction: TradeDirection): string {
  const bucketMs = Math.floor(Date.parse(firedAtIso) / BAR_MS) * BAR_MS;
  return `${new Date(bucketMs).toISOString()}|${direction}`;
}

export function lookupLiveFill(
  fillMap: Map<string, LiveFillRecord>,
  signalId: string,
  firedAtIso: string,
  direction: TradeDirection,
): LiveFillRecord | undefined {
  return fillMap.get(signalId) ?? fillMap.get(m5BucketKey(firedAtIso, direction));
}

export function storeLiveFill(
  fillMap: Map<string, LiveFillRecord>,
  signalId: string,
  firedAtIso: string,
  direction: TradeDirection,
  record: LiveFillRecord,
): void {
  fillMap.set(m5BucketKey(firedAtIso, direction), record);
  if (signalId) fillMap.set(signalId, record);
}
