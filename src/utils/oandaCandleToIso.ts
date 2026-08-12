/**
 * Cap OANDA candle `to` slightly behind wall clock.
 * Railway can be a few seconds ahead of OANDA → 400 "Time is in the future".
 */

/** Skew buffer — enough for host/OANDA clock drift without dropping a full M5. */
export const OANDA_TO_SKEW_MS = 60_000;

export function clampOandaToIso(toISO: string, nowMs: number = Date.now()): string {
  const toMs = Date.parse(toISO);
  if (!Number.isFinite(toMs)) return toISO;
  const safeMs = nowMs - OANDA_TO_SKEW_MS;
  if (toMs <= safeMs) return toISO;
  return new Date(safeMs).toISOString();
}
