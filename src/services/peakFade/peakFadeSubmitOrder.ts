/** Broker market order for Peak Fade (TP only). */

import type { BrokerClient } from '../../connectors/broker/types.js';
import { peakFadeError, peakFadeWarn } from './peakFadeLogger.js';

export type PeakFadeFill = { tradeId: string; fillPrice: number };

export async function submitPeakFadeOrder(
  broker: BrokerClient,
  brokerId: string,
  pair: string,
  signedUnits: number,
  takeProfitPrice: string,
): Promise<PeakFadeFill | null> {
  let orderResult;
  try {
    orderResult = await broker.placeMarketOrder({
      instrument: pair,
      units: signedUnits,
      takeProfitPrice,
    });
  } catch (err) {
    peakFadeError('placeMarketOrder failed', { brokerId, error: String(err) });
    return null;
  }
  const fillTx = orderResult.orderFillTransaction;
  if (orderResult.orderCancelTransaction || !fillTx) {
    peakFadeWarn('Order cancelled', {
      brokerId,
      reason: orderResult.orderCancelTransaction?.reason,
    });
    return null;
  }
  const tradeId = fillTx.tradeOpened?.tradeID ?? fillTx.id ?? null;
  const fillPrice = fillTx.price != null ? Number(fillTx.price) : null;
  if (!fillPrice || !tradeId) return null;
  return { tradeId, fillPrice };
}
