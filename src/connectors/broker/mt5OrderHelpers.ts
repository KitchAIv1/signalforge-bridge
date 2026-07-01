/**
 * MT5 order helpers — map BrokerClient params to MetaApi RPC calls.
 */

import type { PlaceOrderParams, PlaceOrderResult } from './types.js';
import { clampMt5Lots } from './lotConverter.js';

const MIN_LOT = 0.01;
const LOT_STEP = 0.01;

type RpcConnection = Awaited<
  ReturnType<typeof import('./mt5RpcPool.js').getMt5RpcConnection>
>;

function isTradeDone(result: Record<string, unknown>): boolean {
  const code = String(result.stringCode ?? result.description ?? '');
  return code === 'TRADE_RETCODE_DONE' || code.includes('DONE');
}

function parseFillPrice(result: Record<string, unknown>): number | null {
  const price = result.price ?? result.openPrice;
  if (price == null) return null;
  const num = Number(price);
  return Number.isFinite(num) ? num : null;
}

export async function placeMt5MarketOrder(
  rpc: RpcConnection,
  params: PlaceOrderParams,
  brokerSymbol: string,
  volumeLots: number,
): Promise<PlaceOrderResult> {
  const lots = clampMt5Lots(volumeLots, MIN_LOT, LOT_STEP);
  const sl = params.stopLossPrice != null ? Number(params.stopLossPrice) : undefined;
  const tp = params.takeProfitPrice != null ? Number(params.takeProfitPrice) : undefined;
  const options = {
    comment: 'sf_bridge',
    magic: params.magicNumber,
  };
  const isBuy = params.units > 0;
  const rawResult = isBuy
    ? await rpc.createMarketBuyOrder(brokerSymbol, lots, sl, tp, options)
    : await rpc.createMarketSellOrder(brokerSymbol, lots, sl, tp, options);

  if (!isTradeDone(rawResult)) {
    return {
      orderCancelTransaction: {
        reason: String(rawResult.stringCode ?? rawResult.description ?? 'MT5_REJECTED'),
      },
    };
  }

  const positionId = String(rawResult.positionId ?? rawResult.orderId ?? rawResult.id ?? '');
  const fillPrice = parseFillPrice(rawResult);
  return {
    orderFillTransaction: {
      id: positionId,
      tradeOpened: { tradeID: positionId, units: String(params.units) },
      price: fillPrice != null ? String(fillPrice) : undefined,
      units: String(params.units),
    },
  };
}

export { MIN_LOT, LOT_STEP };
