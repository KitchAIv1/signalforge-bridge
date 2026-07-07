import { assertOandaServerEnv } from '@/lib/oandaServerEnv';
import { oandaDashboardFetch, readOandaErrorBody } from '@/lib/oandaHttp';

export interface LiveTrade {
  id: string;
  instrument: string;
  units: string;
  openTime: string;
  unrealizedPL: string;
  price: string;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
}

export async function fetchOpenTrades(): Promise<LiveTrade[]> {
  const { accountId } = assertOandaServerEnv();
  const res = await oandaDashboardFetch(`/v3/accounts/${accountId}/openTrades`);
  if (!res.ok) {
    const detail = await readOandaErrorBody(res);
    throw new Error(`OANDA openTrades failed — ${detail}`);
  }
  const json = (await res.json()) as {
    trades?: Array<{
      id: string;
      instrument: string;
      currentUnits: string;
      openTime: string;
      unrealizedPL?: string;
      price?: string;
      stopLossOrder?: { price: string };
      takeProfitOrder?: { price: string };
    }>;
  };
  return (json.trades ?? []).map((trade) => ({
    id: trade.id,
    instrument: trade.instrument,
    units: trade.currentUnits,
    openTime: trade.openTime,
    unrealizedPL: trade.unrealizedPL ?? '0',
    price: trade.price ?? '0',
    stopLossPrice: trade.stopLossOrder?.price ?? null,
    takeProfitPrice: trade.takeProfitOrder?.price ?? null,
  }));
}

export async function closeTradeById(tradeId: string): Promise<void> {
  const { accountId } = assertOandaServerEnv();
  const res = await oandaDashboardFetch(
    `/v3/accounts/${accountId}/trades/${tradeId}/close`,
    { method: 'PUT' },
  );
  if (!res.ok) {
    const detail = await readOandaErrorBody(res);
    throw new Error(`OANDA close trade failed — ${detail}`);
  }
}

export async function closeAllTrades(tradeIds: string[]): Promise<void> {
  await Promise.all(tradeIds.map((tradeId) => closeTradeById(tradeId)));
}
