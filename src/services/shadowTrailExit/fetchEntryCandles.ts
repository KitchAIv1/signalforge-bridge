/** Fetch M5 candles after omega entry for shadow trail walk. */

import { fetchCandleRange } from '../../connectors/oanda.js';
import type { M5Bar } from './types.js';

export async function fetchM5BarsAfterEntry(
  pair: string,
  firedAtIso: string,
): Promise<M5Bar[]> {
  const fromMs = Date.parse(firedAtIso);
  const toIso = new Date(fromMs + 48 * 60 * 60 * 1000).toISOString();
  const raw = await fetchCandleRange(pair, firedAtIso, toIso, 'M5');
  return raw
    .map(row => ({
      time: row.time,
      open: parseFloat(row.mid.o),
      high: parseFloat(row.mid.h),
      low: parseFloat(row.mid.l),
      close: parseFloat(row.mid.c),
    }))
    .filter(bar => Date.parse(bar.time) > fromMs);
}
