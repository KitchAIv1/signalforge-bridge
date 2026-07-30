/** Earliest valid PDL detection time: 11:55 M5 is closed at 12:00 UTC. */
export function pdlDetectionMinIso(tradeDate: string): string {
  return `${tradeDate}T12:00:00.000Z`;
}

/** True when detection wrote after the 11:55 bar can exist (12:00 UTC+). */
export function isFreshPdlDetection(
  tradeDate: string,
  evaluatedAt: string | null | undefined,
): boolean {
  if (evaluatedAt == null || evaluatedAt === '') return false;
  const evaluatedMs = Date.parse(evaluatedAt);
  const minMs = Date.parse(pdlDetectionMinIso(tradeDate));
  if (!Number.isFinite(evaluatedMs) || !Number.isFinite(minMs)) return false;
  return evaluatedMs >= minMs;
}
