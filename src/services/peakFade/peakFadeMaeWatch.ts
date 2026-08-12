/**
 * Alert when open Peak Fade adverse excursion hits risk-ref (human flatten).
 * Does not close — no-SL product lock.
 */

import { getPricing } from '../../connectors/oanda.js';
import { sendPeakFadeMaeAlert } from '../telegram/alertPeakFadeMae.js';
import { PEAK_FADE_PIP_SIZE } from './peakFadeConstants.js';
import { loadAllOpenTrades } from './peakFadeDayState.js';
import { peakFadeWarn } from './peakFadeLogger.js';
import type { PeakFadeConfig, PeakFadeDirection } from './peakFadeTypes.js';

const alertedTradeKeys = new Set<string>();

function adversePips(
  direction: PeakFadeDirection,
  entry: number,
  mid: number,
): number {
  const raw =
    direction === 'long'
      ? (entry - mid) / PEAK_FADE_PIP_SIZE
      : (mid - entry) / PEAK_FADE_PIP_SIZE;
  return Math.round(raw * 10) / 10;
}

async function loadAudUsdMid(): Promise<number | null> {
  try {
    const quotes = await getPricing('AUD_USD');
    if (!quotes.length) return null;
    const bid = parseFloat(quotes[0]!.bid);
    const ask = parseFloat(quotes[0]!.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
    return (bid + ask) / 2;
  } catch {
    return null;
  }
}

export async function runPeakFadeMaeWatch(cfg: PeakFadeConfig): Promise<void> {
  const openTrades = await loadAllOpenTrades(cfg.pair);
  if (!openTrades.length) {
    alertedTradeKeys.clear();
    return;
  }
  const mid = await loadAudUsdMid();
  if (mid == null) {
    peakFadeWarn('MAE watch: no AUD_USD mid');
    return;
  }
  const threshold = cfg.riskRefPips;
  const liveKeys = new Set<string>();

  for (const trade of openTrades) {
    const key = `${trade.broker_id ?? '?'}:${trade.broker_trade_id ?? trade.id}`;
    liveKeys.add(key);
    const adverse = adversePips(
      trade.direction as PeakFadeDirection,
      Number(trade.entry_price),
      mid,
    );
    if (adverse < threshold || alertedTradeKeys.has(key)) continue;
    alertedTradeKeys.add(key);
    void sendPeakFadeMaeAlert({
      brokerId: trade.broker_id ?? 'unknown',
      instrument: cfg.pair,
      direction: trade.direction,
      entryPrice: Number(trade.entry_price),
      currentPrice: mid,
      adversePips: adverse,
      thresholdPips: threshold,
    }).catch(() => {});
  }

  for (const key of [...alertedTradeKeys]) {
    if (!liveKeys.has(key)) alertedTradeKeys.delete(key);
  }
}
