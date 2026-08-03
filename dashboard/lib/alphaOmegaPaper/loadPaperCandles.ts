/** OANDA M5 mid candles for paper path (read-only; dashboard server env). */

import { oandaDashboardFetch, readOandaErrorBody } from '@/lib/oandaHttp';
import type { PaperCandle } from './paperSimTypes';

/** Keep under OANDA ~5000 M5 bar cap (~17d). */
const CHUNK_MS = 15 * 24 * 60 * 60 * 1000;

async function fetchM5Window(fromIso: string, toIso: string): Promise<PaperCandle[]> {
  const path =
    `/v3/instruments/AUD_USD/candles?granularity=M5&price=M&includeFirst=true` +
    `&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const res = await oandaDashboardFetch(path);
  if (!res.ok) {
    throw new Error(`OANDA M5 paper candles failed — ${await readOandaErrorBody(res)}`);
  }
  const json = (await res.json()) as {
    candles?: Array<{
      time: string;
      complete: boolean;
      mid: { h: string; l: string; c: string };
    }>;
  };
  return (json.candles ?? [])
    .filter((bar) => bar.complete)
    .map((bar) => ({
      time: bar.time,
      h: Number(bar.mid.h),
      l: Number(bar.mid.l),
      c: Number(bar.mid.c),
    }));
}

/** Chunked M5 load for open-paper sim fallback (stored closes skip this). */
export async function loadPaperM5Candles(
  fromIso: string,
  toIso: string,
): Promise<PaperCandle[]> {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!(toMs > fromMs)) return [];
  const byTime = new Map<string, PaperCandle>();
  for (let start = fromMs; start < toMs; start += CHUNK_MS) {
    const end = Math.min(start + CHUNK_MS, toMs);
    const chunk = await fetchM5Window(
      new Date(start).toISOString(),
      new Date(end).toISOString(),
    );
    for (const bar of chunk) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );
}
