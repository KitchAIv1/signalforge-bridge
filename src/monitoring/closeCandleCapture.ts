/**
 * Intra-trade + post-exit M5 candles for bridge_trade_log (omega close paths).
 * Depends only on oanda connector — safe for tradeMonitor and trailingStopMonitor.
 */

import { fetchCompletedCandles, fetchCandleRange } from '../connectors/oanda.js';

export type CloseCandleBar = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

/**
 * Fetches intra-trade and post-exit candles for intelligence capture.
 * Always returns safely — never throws, never blocks trade close logic.
 */
export async function fetchCloseCandles(
  pair: string,
  entryIso: string,
  closedAtIso: string
): Promise<{
  intraTradeCandles: CloseCandleBar[];
  postExitCandles:   CloseCandleBar[];
}> {
  try {
    const postExitEnd = new Date(
      new Date(closedAtIso).getTime() + 60 * 60 * 1000
    ).toISOString();

    const [intraTradeCandles, postExitCandles] = await Promise.all([
      fetchCandleRange(pair, entryIso, closedAtIso, 'M5'),
      fetchCompletedCandles(pair, 'M5', closedAtIso, postExitEnd),
    ]);

    return { intraTradeCandles, postExitCandles };
  } catch {
    return { intraTradeCandles: [], postExitCandles: [] };
  }
}
