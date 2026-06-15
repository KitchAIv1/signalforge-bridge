const OANDA_ENV = process.env.OANDA_ENVIRONMENT ?? 'practice';
const BASE_URL = OANDA_ENV === 'live'
  ? 'https://api-fxtrade.oanda.com'
  : 'https://api-fxpractice.oanda.com';

const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID ?? '';
const API_TOKEN = process.env.OANDA_API_TOKEN ?? '';

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
  const res = await fetch(
    `${BASE_URL}/v3/accounts/${ACCOUNT_ID}/openTrades`,
    {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) throw new Error(`OANDA openTrades failed: ${res.status}`);
  const json = await res.json() as {
    trades?: Array<{
      id: string;
      instrument: string;
      currentUnits: string;
      openTime: string;
      unrealizedPL?: string;
      price?: string;
      stopLossOrder?: { price: string };
      takeProfitOrder?: { price: string };
    }>
  };
  return (json.trades ?? []).map(t => ({
    id: t.id,
    instrument: t.instrument,
    units: t.currentUnits,
    openTime: t.openTime,
    unrealizedPL: t.unrealizedPL ?? '0',
    price: t.price ?? '0',
    stopLossPrice: t.stopLossOrder?.price ?? null,
    takeProfitPrice: t.takeProfitOrder?.price ?? null,
  }));
}

export async function closeTradeById(tradeId: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/v3/accounts/${ACCOUNT_ID}/trades/${tradeId}/close`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) throw new Error(`OANDA close trade failed: ${res.status}`);
}

export async function closeAllTrades(tradeIds: string[]): Promise<void> {
  await Promise.all(tradeIds.map(id => closeTradeById(id)));
}
