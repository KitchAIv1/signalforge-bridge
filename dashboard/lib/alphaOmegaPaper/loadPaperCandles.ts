/** OANDA M5 mid candles for paper path (read-only; dashboard server env). */

import { oandaDashboardFetch, readOandaErrorBody } from '@/lib/oandaHttp';
import type { PaperCandle } from './paperSimTypes';

export async function loadPaperM5Candles(
  fromIso: string,
  toIso: string,
): Promise<PaperCandle[]> {
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
