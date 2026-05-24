import { fetchCompletedCandles } from '../../connectors/oanda.js';
import type { ParsedCandle } from './types.js';

const AUD_USD_PAIR = 'AUD_USD';

function subtractCalendarDays(tradeDateUtc: string, dayCount: number): string {
  const cursor = new Date(`${tradeDateUtc}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - dayCount);
  return cursor.toISOString().slice(0, 10);
}

function parseCompletedCandle(
  candle: { mid: { o: string; h: string; l: string; c: string } },
): ParsedCandle {
  return {
    open: parseFloat(candle.mid.o),
    high: parseFloat(candle.mid.h),
    low: parseFloat(candle.mid.l),
    close: parseFloat(candle.mid.c),
  };
}

/** Last completed D1 candle strictly before 21:00 UTC on tradeDateUtc. */
export async function fetchPriorD1Candle(
  tradeDateUtc: string,
  oandaToken: string,
  oandaEnv: string,
): Promise<ParsedCandle | null> {
  if (!oandaToken) {
    console.error('[AsianDirection] Missing OANDA API token');
    return null;
  }

  if (oandaEnv !== 'practice' && oandaEnv !== 'live') {
    console.error('[AsianDirection] Invalid OANDA environment:', oandaEnv);
    return null;
  }

  try {
    const fromDate = subtractCalendarDays(tradeDateUtc, 3);
    const fromISO = `${fromDate}T00:00:00.000000000Z`;
    const toISO = `${tradeDateUtc}T21:00:00.000000000Z`;
    const d1Bars = await fetchCompletedCandles(AUD_USD_PAIR, 'D', fromISO, toISO);

    if (d1Bars.length === 0) return null;

    return parseCompletedCandle(d1Bars[d1Bars.length - 1]);
  } catch (fetchErr: unknown) {
    console.error(
      '[AsianDirection] Prior D1 fetch failed:',
      fetchErr instanceof Error ? fetchErr.message : fetchErr,
    );
    return null;
  }
}
