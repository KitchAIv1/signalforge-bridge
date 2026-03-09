/**
 * OANDA v20 REST client. Token from OANDA_API_TOKEN env only.
 * Methods: getAccountSummary, getOpenTrades, getPricing, placeMarketOrder, closeTrade.
 */

const OANDA_TOKEN = process.env.OANDA_API_TOKEN;
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const OANDA_ENV = process.env.OANDA_ENVIRONMENT ?? 'practice';

const BASE_URL =
  OANDA_ENV === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com';

const DEFAULT_TIMEOUT_MS = 10000;

async function oandaFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  if (!OANDA_TOKEN || !OANDA_ACCOUNT_ID) {
    throw new Error('Missing OANDA_API_TOKEN or OANDA_ACCOUNT_ID');
  }
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${OANDA_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface AccountSummary {
  balance: number;
  equity: number;
  unrealizedPL: number;
  marginUsed: number;
  marginAvailable: number;
  openTradeCount: number;
}

export async function getAccountSummary(): Promise<AccountSummary> {
  const res = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/summary`);
  if (!res.ok) throw new Error(`OANDA account summary failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { account?: { balance?: string; NAV?: string; unrealizedPL?: string; marginUsed?: string; marginAvailable?: string; openTradeCount?: number } };
  const acc = json.account;
  if (!acc) throw new Error('OANDA response missing account');
  return {
    balance: parseFloat(acc.balance ?? '0'),
    equity: parseFloat(acc.NAV ?? acc.balance ?? '0'),
    unrealizedPL: parseFloat(acc.unrealizedPL ?? '0'),
    marginUsed: parseFloat(acc.marginUsed ?? '0'),
    marginAvailable: parseFloat(acc.marginAvailable ?? '0'),
    openTradeCount: acc.openTradeCount ?? 0,
  };
}

export interface OpenTrade {
  id: string;
  instrument: string;
  units: string;
  openTime: string;
  stopLossOrderID?: string;
  takeProfitOrderID?: string;
  unrealizedPL?: string;
}

export async function getOpenTrades(): Promise<OpenTrade[]> {
  const res = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/openTrades`);
  if (!res.ok) throw new Error(`OANDA openTrades failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { trades?: Array<{ id: string; instrument: string; currentUnits: string; openTime: string; stopLossOrderID?: string; takeProfitOrderID?: string; unrealizedPL?: string }> };
  const trades = json.trades ?? [];
  return trades.map((t) => ({
    id: t.id,
    instrument: t.instrument,
    units: t.currentUnits,
    openTime: t.openTime,
    stopLossOrderID: t.stopLossOrderID,
    takeProfitOrderID: t.takeProfitOrderID,
    unrealizedPL: t.unrealizedPL,
  }));
}

export interface PriceQuote {
  instrument: string;
  bid: string;
  ask: string;
  spread: string;
}

export async function getPricing(instruments: string): Promise<PriceQuote[]> {
  const res = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instruments)}`);
  if (!res.ok) throw new Error(`OANDA pricing failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { prices?: Array<{ instrument: string; bids: Array<{ price: string }>; asks: Array<{ price: string }>; closeoutBid?: string; closeoutAsk?: string }> };
  const prices = json.prices ?? [];
  return prices.map((p) => ({
    instrument: p.instrument,
    bid: p.bids?.[0]?.price ?? p.closeoutBid ?? '0',
    ask: p.asks?.[0]?.price ?? p.closeoutAsk ?? '0',
    spread: (parseFloat(p.asks?.[0]?.price ?? '0') - parseFloat(p.bids?.[0]?.price ?? '0')).toFixed(5),
  }));
}

export interface PlaceOrderParams {
  instrument: string;
  units: number;
  stopLossPrice?: string;
  takeProfitPrice?: string;
}

export interface PlaceOrderResult {
  orderFillTransaction?: { id: string; tradeOpened?: { tradeID: string }; fill?: string };
  orderCancelTransaction?: { reason?: string };
}

export async function placeMarketOrder(params: PlaceOrderParams, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<PlaceOrderResult> {
  const body = {
    order: {
      type: 'MARKET',
      instrument: params.instrument,
      units: String(params.units),
      timeInForce: 'FOK',
      positionFill: 'DEFAULT',
      ...(params.stopLossPrice && {
        stopLossOnFill: { price: params.stopLossPrice, timeInForce: 'GTC' as const },
      }),
      ...(params.takeProfitPrice && {
        takeProfitOnFill: { price: params.takeProfitPrice, timeInForce: 'GTC' as const },
      }),
    },
  };
  const res = await oandaFetch(
    `/v3/accounts/${OANDA_ACCOUNT_ID}/orders`,
    { method: 'POST', body: JSON.stringify(body) },
    timeoutMs
  );
  const json = (await res.json()) as PlaceOrderResult & { orderFillTransaction?: unknown; orderCancelTransaction?: unknown };
  if (!res.ok) throw new Error(`OANDA place order failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export async function closeTrade(tradeId: string, units?: string): Promise<unknown> {
  const body = units ? { units } : {};
  const res = await oandaFetch(
    `/v3/accounts/${OANDA_ACCOUNT_ID}/trades/${tradeId}/close`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`OANDA close trade failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function getAccountId(): string {
  if (!OANDA_ACCOUNT_ID) throw new Error('OANDA_ACCOUNT_ID not set');
  return OANDA_ACCOUNT_ID;
}
