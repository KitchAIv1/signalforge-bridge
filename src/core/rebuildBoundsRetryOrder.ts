import {
  placeMarketOrder,
  type PlaceOrderParams,
  type PlaceOrderResult,
} from '../connectors/oanda.js';

/** Subset of validateSignal().normalized used for OANDA market orders */
export type MarketOrderNormSlice = {
  engineId: string;
  oandaInstrument: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
};

/** bridge_config.config_value for key rebuild_bounds_retry */
export function parseRebuildBoundsRetryFlag(raw: unknown): boolean {
  return raw === true;
}

export function computeRebuildPriceBound(norm: MarketOrderNormSlice): string | undefined {
  if (norm.engineId !== 'engine_rebuild') return undefined;
  const pipSize = norm.oandaInstrument.includes('JPY') ? 0.01 : 0.0001;
  const decimals = norm.oandaInstrument.includes('JPY') ? 3 : 5;
  const bound =
    norm.direction === 'LONG'
      ? norm.entryPrice + 2 * pipSize
      : norm.entryPrice - 2 * pipSize;
  return bound.toFixed(decimals);
}

function buildMarketParams(
  norm: MarketOrderNormSlice,
  unitsForOrder: number,
  useTrailStop: boolean,
  includePriceBound: boolean,
  priceBoundFormatted: string | undefined
): PlaceOrderParams {
  const decimals = norm.oandaInstrument.includes('JPY') ? 3 : 5;
  return {
    instrument: norm.oandaInstrument,
    units: unitsForOrder,
    ...(includePriceBound &&
      priceBoundFormatted != null && {
        priceBound: priceBoundFormatted,
      }),
    ...(useTrailStop
      ? {}
      : {
          stopLossPrice: norm.stopLoss.toFixed(decimals),
          takeProfitPrice: norm.takeProfit.toFixed(decimals),
        }),
  };
}

/**
 * engine_rebuild: first submission uses 2-pip priceBound when enabled.
 * If OANDA cancels with BOUNDS_VIOLATION and
 * rebuildBoundsRetryEnabled, waits 1500ms then
 * retries once WITH same 2-pip priceBound.
 */
export async function placeMarketOrderWithRebuildBoundsRetry(params: {
  norm: MarketOrderNormSlice;
  finalUnits: number;
  useTrailStop: boolean;
  maxOrderTimeoutMs: number;
  rebuildBoundsRetryEnabled: boolean;
}): Promise<{ orderResult: PlaceOrderResult; retriedWithoutPriceBound: boolean }> {
  const { norm, finalUnits, useTrailStop, maxOrderTimeoutMs, rebuildBoundsRetryEnabled } = params;
  const priceBoundFormatted = computeRebuildPriceBound(norm);
  let retriedWithoutPriceBound = false;

  let orderResult = await placeMarketOrder(
    buildMarketParams(norm, finalUnits, useTrailStop, true, priceBoundFormatted),
    maxOrderTimeoutMs
  );

  const cancelReason = orderResult.orderCancelTransaction?.reason ?? '';
  if (
    orderResult.orderCancelTransaction &&
    norm.engineId === 'engine_rebuild' &&
    cancelReason === 'BOUNDS_VIOLATION' &&
    rebuildBoundsRetryEnabled &&
    priceBoundFormatted != null
  ) {
    // Wait 1500ms — M1 simulation confirmed that
    // 2-pip priceBound is the correct bound.
    // Wider bounds produce worse fills and push TP
    // beyond reachable range within 30-min hold.
    // 1500ms gives spread more time to normalise
    // below 2 pips after momentary spike.
    // NFP sustained spreads (8-15 pip) remain blocked
    // correctly — 1500ms does not normalize those.
    await new Promise<void>(
      (resolve) => setTimeout(resolve, 1500)
    );
    retriedWithoutPriceBound = true;
    orderResult = await placeMarketOrder(
      buildMarketParams(norm, finalUnits, useTrailStop, true, priceBoundFormatted),
      maxOrderTimeoutMs
    );
  }

  return { orderResult, retriedWithoutPriceBound };
}
