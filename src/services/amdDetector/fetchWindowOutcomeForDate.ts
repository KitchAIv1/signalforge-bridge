import { fetchCompletedCandles } from '../../connectors/oanda.js';

const AUD_AMD_PAIR = 'AUD_USD';

/** Tag-to-window mapping from validated backtest. */
const TAG_WINDOW: Record<string, {
  fromHour: number;
  fromMin: number;
  toHour: number;
  toMin: number;
}> = {
  AMD_COMPRESSION_BREAKOUT: {
    fromHour: 10, fromMin: 31,
    toHour: 13, toMin: 0,
  },
  AMD_NONE: {
    fromHour: 10, fromMin: 31,
    toHour: 11, toMin: 0,
  },
  AMD_FAILED: {
    fromHour: 11, fromMin: 0,
    toHour: 12, toMin: 0,
  },
  AMD_TEXTBOOK: {
    fromHour: 12, fromMin: 0,
    toHour: 13, toMin: 0,
  },
  AMD_SHIFTED: {
    fromHour: 12, fromMin: 0,
    toHour: 13, toMin: 0,
  },
};

function padTime(h: number, m: number): string {
  return `${h.toString().padStart(2, '0')}:` +
    `${m.toString().padStart(2, '0')}:00.000000000Z`;
}

export type WindowOutcomeResult = {
  window_tag_used: string;
  window_from_utc: string;
  window_to_utc: string;
  window_pip_move: number | null;
  window_direction_confirmed: boolean | null;
  window_candles: unknown[];
  window_evaluated_at: string;
};

/**
 * Fetch M5 candles for the tag-specific distribution
 * window and compute outcome.
 *
 * tag: use amd_outcome_tag if populated, else amd_tag
 * autoDirection: from amd_state.auto_direction
 *   'long'  → confirmed if window net pips > 0
 *   'short' → confirmed if window net pips < 0
 *   'neutral' → window_direction_confirmed = null
 */
export async function fetchWindowOutcomeForDate(
  tradeDate: string,
  tag: string,
  autoDirection: string | null,
): Promise<WindowOutcomeResult | null> {

  const window = TAG_WINDOW[tag];
  if (!window) {
    return null;
  }

  const fromISO =
    `${tradeDate}T${padTime(window.fromHour, window.fromMin)}`;
  const toISO =
    `${tradeDate}T${padTime(window.toHour, window.toMin)}`;

  try {
    const raw = await fetchCompletedCandles(
      AUD_AMD_PAIR, 'M5', fromISO, toISO,
    );

    const candles = (raw ?? [])
      .map((c) => ({
        time: c.time,
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
      }))
      .sort(
        (a, b) =>
          new Date(a.time).getTime() -
          new Date(b.time).getTime(),
      );

    const netPips = candles.length === 0
      ? null
      : parseFloat(
          (
            candles.reduce(
              (sum, candle) => sum + (candle.c - candle.o),
              0,
            ) * 10000
          ).toFixed(4),
        );

    let confirmed: boolean | null = null;
    if (netPips !== null && autoDirection === 'long') {
      confirmed = netPips > 0;
    } else if (netPips !== null && autoDirection === 'short') {
      confirmed = netPips < 0;
    }

    return {
      window_tag_used: tag,
      window_from_utc: fromISO,
      window_to_utc: toISO,
      window_pip_move: netPips,
      window_direction_confirmed: confirmed,
      window_candles: candles,
      window_evaluated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
