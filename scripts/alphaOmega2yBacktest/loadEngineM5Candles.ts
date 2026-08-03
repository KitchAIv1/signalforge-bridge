/** Load engine AUDUSD M5_long cache (+ optional OANDA tail extend) into AoCandle[]. */

import { existsSync, readFileSync } from 'node:fs';
import type { AoCandle } from './aoTypes.js';

interface EngineM5CachePayload {
  pair?: string;
  granularity?: string;
  fetchedAt?: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
}

export const DEFAULT_ENGINE_M5_LONG_PATH =
  '/Users/willis/SIGNALFORGE/engine-omega/output/cachedCandles_AUDUSD_M5_long.json';

function toAoCandle(timeMs: number, open: number, high: number, low: number, close: number): AoCandle {
  return {
    time: new Date(timeMs).toISOString(),
    o: open,
    h: high,
    l: low,
    c: close,
  };
}

export function loadEngineM5LongCandles(cachePath: string = DEFAULT_ENGINE_M5_LONG_PATH): AoCandle[] {
  if (!existsSync(cachePath)) {
    throw new Error(`Missing M5 long cache: ${cachePath}`);
  }
  const payload = JSON.parse(readFileSync(cachePath, 'utf8')) as EngineM5CachePayload;
  return payload.candles.map((bar) => toAoCandle(bar.time, bar.open, bar.high, bar.low, bar.close));
}

/** Extend cache forward via OANDA (bridge env) when static file is stale. */
function lastCandleMs(candles: readonly AoCandle[]): number {
  let maxMs = 0;
  for (const candle of candles) {
    const ms = Date.parse(candle.time);
    if (ms > maxMs) maxMs = ms;
  }
  return maxMs;
}

export async function loadEngineM5LongExtended(
  cachePath: string = DEFAULT_ENGINE_M5_LONG_PATH,
): Promise<AoCandle[]> {
  const cached = loadEngineM5LongCandles(cachePath);
  const lastCachedMs = lastCandleMs(cached);
  const nowMs = Date.now() - 60_000;
  if (lastCachedMs >= nowMs - 10 * 60 * 1000) return cached;

  const token = process.env.OANDA_API_TOKEN ?? process.env.OANDA_API_KEY;
  if (!token) {
    console.warn('No OANDA token — using static M5_long only (may be stale).');
    return cached;
  }
  const env = process.env.OANDA_ENVIRONMENT ?? 'practice';
  const baseUrl =
    env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
  const fromIso = new Date(lastCachedMs + 1).toISOString();
  const toIso = new Date(nowMs).toISOString();
  const url =
    `${baseUrl}/v3/instruments/AUD_USD/candles?granularity=M5&price=M&includeFirst=true` +
    `&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.warn(`OANDA extend failed ${res.status} — using static cache.`);
    return cached;
  }
  const json = (await res.json()) as {
    candles: Array<{ time: string; complete: boolean; mid: { o: string; h: string; l: string; c: string } }>;
  };
  const fresh: AoCandle[] = (json.candles ?? [])
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      o: Number(c.mid.o),
      h: Number(c.mid.h),
      l: Number(c.mid.l),
      c: Number(c.mid.c),
    }));
  console.log(`Extended M5_long by ${fresh.length} bars (${fromIso} → ${toIso}).`);
  const merged = new Map([...cached, ...fresh].map((c) => [c.time, c]));
  return [...merged.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
