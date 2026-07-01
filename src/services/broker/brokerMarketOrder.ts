/**
 * Broker-aware market order placement (rebuild bounds retry for OANDA only).
 */

import type { BrokerClient, PlaceOrderResult } from '../../connectors/broker/types.js';
import {
  computeRebuildPriceBound,
  type MarketOrderNormSlice,
} from '../../core/rebuildBoundsRetryOrder.js';

function buildBrokerParams(
  broker: BrokerClient,
  norm: MarketOrderNormSlice,
  unitsForOrder: number,
  useTrailStop: boolean,
  includePriceBound: boolean,
  priceBoundFormatted: string | undefined,
  takeProfitOverride?: string,
): Parameters<BrokerClient['placeMarketOrder']>[0] {
  const instrument = broker.toBrokerInstrument(norm.oandaInstrument);
  const decimals = norm.oandaInstrument.includes('JPY') ? 3 : 5;
  const brokerExitParams = takeProfitOverride
    ? {
        takeProfitPrice: takeProfitOverride,
        stopLossPrice: norm.stopLoss.toFixed(decimals),
      }
    : {
        stopLossPrice: norm.stopLoss.toFixed(decimals),
        takeProfitPrice: norm.takeProfit.toFixed(decimals),
      };
  return {
    instrument,
    units: unitsForOrder,
    ...(includePriceBound &&
      priceBoundFormatted != null &&
      broker.brokerType === 'oanda' && { priceBound: priceBoundFormatted }),
    ...(useTrailStop ? {} : brokerExitParams),
  };
}

export async function placeMarketOrderViaBroker(params: {
  broker: BrokerClient;
  norm: MarketOrderNormSlice;
  finalUnits: number;
  useTrailStop: boolean;
  maxOrderTimeoutMs: number;
  rebuildBoundsRetryEnabled: boolean;
  takeProfitPriceOverride?: string;
}): Promise<{ orderResult: PlaceOrderResult; retriedWithoutPriceBound: boolean }> {
  const {
    broker,
    norm,
    finalUnits,
    useTrailStop,
    maxOrderTimeoutMs,
    rebuildBoundsRetryEnabled,
    takeProfitPriceOverride,
  } = params;
  const priceBoundFormatted = computeRebuildPriceBound(norm);
  let retriedWithoutPriceBound = false;

  let orderResult = await broker.placeMarketOrder(
    buildBrokerParams(
      broker,
      norm,
      finalUnits,
      useTrailStop,
      true,
      priceBoundFormatted,
      takeProfitPriceOverride,
    ),
    maxOrderTimeoutMs,
  );

  const cancelReason = orderResult.orderCancelTransaction?.reason ?? '';
  if (
    broker.brokerType === 'oanda' &&
    orderResult.orderCancelTransaction &&
    norm.engineId === 'engine_rebuild' &&
    cancelReason === 'BOUNDS_VIOLATION' &&
    rebuildBoundsRetryEnabled &&
    priceBoundFormatted != null
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    retriedWithoutPriceBound = true;
    orderResult = await broker.placeMarketOrder(
      buildBrokerParams(
        broker,
        norm,
        finalUnits,
        useTrailStop,
        false,
        priceBoundFormatted,
        takeProfitPriceOverride,
      ),
      maxOrderTimeoutMs,
    );
  }

  return { orderResult, retriedWithoutPriceBound };
}
