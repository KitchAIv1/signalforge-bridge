/**
 * Pure layer computation functions for the regime detector.
 * No I/O, no side effects. Each function is independently testable.
 */

type OandaCandle = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
};

export type Layer4Result = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
export type Layer5Result = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Layer4Output {
  result:       Layer4Result;
  bullishCount: number;
  bearishCount: number;
}

export interface Layer5Output {
  result:   Layer5Result;
  pipDiff:  number;
  avgFirst3: number;
  avgLast3:  number;
}

export interface Layer6Output {
  positionPct: number;
}

/** Layer 4: D1 trend — counts bullish vs bearish in last 5 prior candles */
export function computeLayer4(
  d1Candles: OandaCandle[],
  targetDate: Date
): Layer4Output {
  const priorCandles = d1Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-5);

  if (priorCandles.length < 5) {
    return { result: 'RANGING', bullishCount: 0, bearishCount: 0 };
  }

  let bullishCount = 0;
  let bearishCount = 0;

  for (const candle of priorCandles) {
    const open  = parseFloat(candle.mid.o);
    const close = parseFloat(candle.mid.c);
    if (close > open) bullishCount++;
    else if (close < open) bearishCount++;
  }

  const result: Layer4Result =
    bullishCount >= 3 ? 'TRENDING_UP' :
    bearishCount >= 3 ? 'TRENDING_DOWN' :
    'RANGING';

  return { result, bullishCount, bearishCount };
}

/** Layer 5: H4 structure — avg of last 3 H4 closes vs first 3, threshold 8 pips */
export function computeLayer5(
  h4Candles: OandaCandle[],
  targetDate: Date
): Layer5Output {
  const THRESHOLD_AUDUSD = 0.0008; // 8 pips

  const priorCandles = h4Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-6);

  if (priorCandles.length < 6) {
    return { result: 'NEUTRAL', pipDiff: 0, avgFirst3: 0, avgLast3: 0 };
  }

  const avgFirst3 =
    priorCandles.slice(0, 3).reduce((sum, c) => sum + parseFloat(c.mid.c), 0) / 3;
  const avgLast3 =
    priorCandles.slice(3, 6).reduce((sum, c) => sum + parseFloat(c.mid.c), 0) / 3;

  const diff    = avgLast3 - avgFirst3;
  const pipDiff = Math.round(diff * 10000);

  const result: Layer5Result =
    diff >  THRESHOLD_AUDUSD ? 'BULLISH' :
    diff < -THRESHOLD_AUDUSD ? 'BEARISH' :
    'NEUTRAL';

  return { result, pipDiff, avgFirst3, avgLast3 };
}

/** Layer 6: 0-100% position of current price within 10-day D1 high/low range */
export function computeLayer6(
  d1Candles: OandaCandle[],
  targetDate: Date
): Layer6Output {
  const priorCandles = d1Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-10);

  if (priorCandles.length < 10) return { positionPct: 50 };

  const rangeHigh    = Math.max(...priorCandles.map(c => parseFloat(c.mid.h)));
  const rangeLow     = Math.min(...priorCandles.map(c => parseFloat(c.mid.l)));
  const currentPrice = parseFloat(priorCandles[priorCandles.length - 1].mid.c);
  const rangeSize    = rangeHigh - rangeLow;

  const positionPct = rangeSize === 0
    ? 50
    : Math.round(((currentPrice - rangeLow) / rangeSize) * 100);

  return { positionPct };
}

// ─── LAYER 7 — WEEKLY OPEN REALITY CHECK ────────────────────────────────────
// Only active during the first H4 window of the new trading week:
// Sunday 21:00 UTC → Monday 01:00 UTC.
// Compares current live price to Friday's D1 close.
// If price has pulled back 8+ pips from Friday → override L5 to BEARISH.
// If price has gapped up 8+ pips from Friday → override L5 to BULLISH.
// Within 8 pips either side → no override, return null.
// This resolves the weekend candle gap: no H4 candles exist over the weekend
// so Layer 5 reads stale Friday data. Layer 7 replaces that with a live check.

export interface Layer7Output {
  active:         boolean;         // true only during Sunday 21:00–Monday 01:00 UTC
  fridayClose:    number | null;   // last D1 candle close price
  currentPrice:   number | null;   // live OANDA mid price at evaluation time
  pipDiff:        number | null;   // (currentPrice - fridayClose) * 10000, signed
  l5Override:     'BEARISH' | 'BULLISH' | null; // null = no override
  overrideReason: string | null;   // human-readable reason for logging
}

/** Returns true if current UTC time is in the weekly open window */
export function isWeeklyOpenWindow(now: Date): boolean {
  const day         = now.getUTCDay();    // 0=Sun, 1=Mon
  const hourUTC     = now.getUTCHours();
  const minuteUTC   = now.getUTCMinutes();
  const timeDecimal = hourUTC + minuteUTC / 60;

  // Sunday 21:00 UTC to Monday 01:00 UTC
  return (day === 0 && timeDecimal >= 21) || (day === 1 && timeDecimal < 1);
}

/**
 * Computes Layer 7 output.
 * @param d1Candles  — same completed D1 candles already fetched by RegimeDetectorService
 * @param currentPrice — live OANDA mid price fetched separately
 * @param now        — current evaluation timestamp
 */
export function computeLayer7(
  d1Candles: Array<{ time: string; mid: { o: string; h: string; l: string; c: string } }>,
  currentPrice: number,
  now: Date
): Layer7Output {
  const THRESHOLD_PIPS    = 8;
  const THRESHOLD_PRICE   = THRESHOLD_PIPS * 0.0001; // 8 pips in price units

  const windowActive = isWeeklyOpenWindow(now);

  if (!windowActive) {
    return {
      active:         false,
      fridayClose:    null,
      currentPrice:   null,
      pipDiff:        null,
      l5Override:     null,
      overrideReason: null,
    };
  }

  // Get Friday's close = last completed D1 candle before now
  const priorCandles = d1Candles.filter(c => new Date(c.time) < now);
  if (priorCandles.length === 0) {
    return {
      active:         true,
      fridayClose:    null,
      currentPrice,
      pipDiff:        null,
      l5Override:     null,
      overrideReason: 'No prior D1 candles available',
    };
  }

  const fridayClose = parseFloat(priorCandles[priorCandles.length - 1].mid.c);
  const diff        = currentPrice - fridayClose;
  const pipDiff     = Math.round(diff * 10000);

  if (diff <= -THRESHOLD_PRICE) {
    return {
      active:         true,
      fridayClose,
      currentPrice,
      pipDiff,
      l5Override:     'BEARISH',
      overrideReason: `Price ${Math.abs(pipDiff)} pips below Friday close → retracement → L5 override BEARISH`,
    };
  }

  if (diff >= THRESHOLD_PRICE) {
    return {
      active:         true,
      fridayClose,
      currentPrice,
      pipDiff,
      l5Override:     'BULLISH',
      overrideReason: `Price ${pipDiff} pips above Friday close → gap up → L5 override BULLISH`,
    };
  }

  return {
    active:         true,
    fridayClose,
    currentPrice,
    pipDiff,
    l5Override:     null,
    overrideReason: `Price within ${THRESHOLD_PIPS} pip threshold (${pipDiff} pips) — no override`,
  };
}

/**
 * Fetches current live mid price for a pair from OANDA pricing endpoint.
 * Used exclusively by Layer 7 during the weekly open window.
 * Returns null on any error — Layer 7 will skip override gracefully.
 */
export async function fetchCurrentMidPrice(
  pair: string
): Promise<number | null> {
  try {
    const token   = process.env.OANDA_API_TOKEN;
    const env     = process.env.OANDA_ENVIRONMENT ?? 'practice';
    const baseUrl = env === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';
    const accountId = process.env.OANDA_ACCOUNT_ID;

    if (!token || !accountId) {
      console.warn('[Layer7] Missing OANDA_API_TOKEN or OANDA_ACCOUNT_ID');
      return null;
    }

    const url = `${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${pair}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Layer7] Pricing fetch failed: ${response.status}`);
      return null;
    }

    const payload = await response.json() as {
      prices: Array<{ asks: Array<{ price: string }>; bids: Array<{ price: string }> }>;
    };

    const price = payload.prices?.[0];
    if (!price) return null;

    const ask = parseFloat(price.asks[0]?.price ?? '0');
    const bid = parseFloat(price.bids[0]?.price ?? '0');

    if (!ask || !bid) return null;

    return (ask + bid) / 2; // mid price
  } catch (err) {
    console.warn('[Layer7] fetchCurrentMidPrice error:', err);
    return null;
  }
}
