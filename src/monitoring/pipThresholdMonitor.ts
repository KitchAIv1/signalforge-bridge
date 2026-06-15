import { getPricing } from '../connectors/oanda.js';
import { sendPipThresholdAlert } from '../services/telegram/alertPipThreshold.js';

const THRESHOLDS = [6, 10];
const firedThresholds = new Map<string, Set<number>>();

function getPipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

function calcPips(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  instrument: string,
): number {
  const pipValue = getPipValue(instrument);
  const raw = direction.toUpperCase() === 'LONG' || direction.toUpperCase() === 'BUY'
    ? (currentPrice - entryPrice) / pipValue
    : (entryPrice - currentPrice) / pipValue;
  return parseFloat(raw.toFixed(1));
}

export async function runPipThresholdMonitor(
  openLogRows: Array<{
    oanda_trade_id: string;
    engine_id: string;
    pair: string;
    direction: string;
    fill_price: number;
  }>,
): Promise<void> {
  if (openLogRows.length === 0) return;

  let currentPrice: number;
  try {
    const pricing = await getPricing('AUD_USD');
    if (!pricing.length) return;
    currentPrice = (parseFloat(pricing[0].ask) + parseFloat(pricing[0].bid)) / 2;
  } catch {
    return;
  }

  for (const row of openLogRows) {
    if (!row.fill_price || !row.direction || !row.pair) continue;

    const pips = calcPips(row.direction, row.fill_price, currentPrice, row.pair);
    if (pips <= 0) continue;

    const tradeKey = row.oanda_trade_id;
    if (!firedThresholds.has(tradeKey)) {
      firedThresholds.set(tradeKey, new Set());
    }
    const fired = firedThresholds.get(tradeKey)!;

    for (const threshold of THRESHOLDS) {
      if (pips >= threshold && !fired.has(threshold)) {
        fired.add(threshold);
        void sendPipThresholdAlert({
          engineId: row.engine_id,
          instrument: row.pair,
          direction: row.direction,
          entryPrice: row.fill_price,
          currentPrice,
          pips,
          threshold,
        }).catch(() => {});
      }
    }
  }

  const openIds = new Set(openLogRows.map((r) => r.oanda_trade_id));
  for (const key of firedThresholds.keys()) {
    if (!openIds.has(key)) firedThresholds.delete(key);
  }
}
