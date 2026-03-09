/**
 * Dedup (pair + direction within window), conflict (opposite open), per-pair limit.
 * Correlation check delegated to correlationChecker.
 */

const DEDUP_CLEAN_INTERVAL_MS = 60000;

interface DedupEntry {
  pair: string;
  direction: string;
  at: number;
}

const dedupMap = new Map<string, DedupEntry>();
let lastClean = Date.now();

function dedupKey(pair: string, direction: string): string {
  return `${pair}:${direction}`;
}

export function isDuplicate(
  pair: string,
  direction: string,
  windowMs: number,
  now: number = Date.now()
): boolean {
  if (now - lastClean > DEDUP_CLEAN_INTERVAL_MS) {
    const cutoff = now - 2 * windowMs;
    for (const [k, v] of dedupMap.entries()) {
      if (v.at < cutoff) dedupMap.delete(k);
    }
    lastClean = now;
  }
  const key = dedupKey(pair, direction);
  const existing = dedupMap.get(key);
  if (existing && now - existing.at < windowMs) return true;
  dedupMap.set(key, { pair, direction, at: now });
  return false;
}

export function registerExecutedSignal(pair: string, direction: string, at: number = Date.now()): void {
  dedupMap.set(dedupKey(pair, direction), { pair, direction, at });
}

export function prePopulateDedupFromLog(
  entries: Array<{ pair: string; direction: string; signal_received_at: string }>
): void {
  const now = Date.now();
  for (const e of entries) {
    const at = new Date(e.signal_received_at).getTime();
    if (now - at < 60000) dedupMap.set(dedupKey(e.pair, e.direction), { pair: e.pair, direction: e.direction, at });
  }
}

export function hasOpenOppositePosition(
  openTrades: Array<{ pair: string; units: number }>,
  pair: string,
  direction: string
): boolean {
  const wantLong = direction === 'LONG' || direction === 'BUY';
  for (const t of openTrades) {
    if (t.pair !== pair) continue;
    const isLong = t.units > 0;
    if (isLong !== wantLong) return true;
  }
  return false;
}

export function countOpenSamePair(openTrades: Array<{ pair: string }>, pair: string): number {
  return openTrades.filter((t) => t.pair === pair).length;
}
