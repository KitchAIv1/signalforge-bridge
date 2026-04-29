/**
 * OANDA v20 REST client. Token from OANDA_API_TOKEN env only.
 * Methods: getAccountSummary, getOpenTrades, getPricing, placeMarketOrder, closeTrade, fetchLatestM5Candle.
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

/** Last fully formed M5 bar: with count=2 OANDA returns [second-latest, latest]; index 0 is the last complete closed bar before the current bucket. */
export interface LatestM5Candle {
  high: number;
  low: number;
  close: number;
  time: string;
}

function parseMidCandleStick(raw: {
  time?: string;
  mid?: { h?: string; l?: string; c?: string };
}): LatestM5Candle | null {
  const mid = raw.mid;
  const timeVal = raw.time;
  if (!mid?.h || !mid?.l || !mid?.c || !timeVal) return null;
  const high = parseFloat(mid.h);
  const low = parseFloat(mid.l);
  const close = parseFloat(mid.c);
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
  return { high, low, close, time: timeVal };
}

const CANDLE_FETCH_MAX_ATTEMPTS = 3;
const CANDLE_FETCH_RETRY_DELAY_MS = 1000;

async function fetchM5CandleAttempt(instrument: string): Promise<LatestM5Candle | null> {
  const name = instrument?.trim();
  if (!name) return null;
  const path = `/v3/instruments/${encodeURIComponent(
    name
  )}/candles?granularity=M5&price=M&count=2`;
  const res = await oandaFetch(path);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    candles?: Array<{
      time?: string;
      mid?: { h?: string; l?: string; c?: string };
    }>;
  };
  const series = json.candles ?? [];
  if (series.length < 2) return null;
  return parseMidCandleStick(series[0] ?? {});
}

/**
 * Mid M5 candles for an OANDA instrument (e.g. AUD_USD). Never throws; returns null after all attempts fail.
 */
export async function fetchLatestM5Candle(instrument: string): Promise<LatestM5Candle | null> {
  for (let attempt = 1; attempt <= CANDLE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fetchM5CandleAttempt(instrument);
      if (result !== null) return result;
      if (attempt < CANDLE_FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, CANDLE_FETCH_RETRY_DELAY_MS));
      }
    } catch {
      if (attempt < CANDLE_FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, CANDLE_FETCH_RETRY_DELAY_MS));
      }
    }
  }
  return null;
}

export interface PlaceOrderParams {
  instrument: string;
  units: number;
  priceBound?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
}

export interface PlaceOrderResult {
  orderFillTransaction?: {
    id: string;
    tradeOpened?: { tradeID: string; units?: string };
    price?: string;
    units?: string;
    fill?: string;
  };
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
      ...(params.priceBound && {
        priceBound: params.priceBound,
      }),
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

export interface CloseTradeResult {
  orderFillTransaction?: { price?: string; pl?: string; time?: string };
  orderCancelTransaction?: { reason?: string };
}

export async function closeTrade(tradeId: string, units?: string): Promise<CloseTradeResult> {
  const body = units ? { units } : {};
  const res = await oandaFetch(
    `/v3/accounts/${OANDA_ACCOUNT_ID}/trades/${tradeId}/close`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`OANDA close trade failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<CloseTradeResult>;
}

export interface ClosedTradeDetails {
  exitPrice: number | null;
  pnlDollars: number | null;
  closedTime: string | null;
}

/**
 * Fetch close details for a trade that is no longer open (e.g. hit TP/SL).
 * Uses transactions API: list by time range then find the ORDER_FILL that closed this trade.
 */
export async function getClosedTradeDetails(
  tradeId: string,
  fromTime: string
): Promise<ClosedTradeDetails> {
  const toTime = new Date().toISOString();
  const res = await oandaFetch(
    `/v3/accounts/${OANDA_ACCOUNT_ID}/transactions?from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}&pageSize=100`
  );
  if (!res.ok) return { exitPrice: null, pnlDollars: null, closedTime: null };
  const listJson = (await res.json()) as { pages?: string[] };
  const pages = listJson.pages ?? [];
  if (pages.length === 0) return { exitPrice: null, pnlDollars: null, closedTime: null };
  const pageUrl = pages[0];
  const path = pageUrl.startsWith('http') ? `${new URL(pageUrl).pathname}${new URL(pageUrl).search}` : pageUrl;
  const pageRes = await oandaFetch(path.startsWith('/') ? path : `/${path}`);
  if (!pageRes.ok) return { exitPrice: null, pnlDollars: null, closedTime: null };
  const pageJson = (await pageRes.json()) as { transactions?: Array<{ type?: string; tradeClosed?: { tradeID?: string }; tradesClosed?: Array<{ tradeID?: string }>; price?: string; pl?: string; time?: string }> };
  const transactions = pageJson.transactions ?? [];
  const closeTx = transactions.find(
    (t) =>
      (t.type === 'ORDER_FILL' || t.type === 'TRADE_CLOSE') &&
      (t.tradeClosed?.tradeID === tradeId || t.tradesClosed?.some((c) => c.tradeID === tradeId))
  );
  if (!closeTx) return { exitPrice: null, pnlDollars: null, closedTime: null };
  const exitPrice = closeTx.price != null ? parseFloat(closeTx.price) : null;
  const pnlDollars = closeTx.pl != null ? parseFloat(closeTx.pl) : null;
  return { exitPrice, pnlDollars, closedTime: closeTx.time ?? null };
}

export async function patchTradeTPSL(
  tradeId: string,
  takeProfitPrice: string,
  stopLossPrice: string
): Promise<void> {
  // RC1 fix: retry once on failure — never silently drop TP placement
  // A missing TP order leaves the trade unprotected on OANDA
  const body = JSON.stringify({
    takeProfit: { price: takeProfitPrice, timeInForce: 'GTC' },
    stopLoss: { price: stopLossPrice, timeInForce: 'GTC' },
  });
  const attempt = async (attemptNum: number): Promise<void> => {
    await oandaFetch(
      `/v3/accounts/${OANDA_ACCOUNT_ID}/trades/${tradeId}/orders`,
      { method: 'PUT', body }
    );
    console.log(
      `[OANDA] Trade ${tradeId} TP/SL patched (attempt ${attemptNum}) — ` +
      `TP=${takeProfitPrice} SL=${stopLossPrice}`
    );
  };
  try {
    await attempt(1);
  } catch (err1) {
    console.error(
      `[OANDA] patchTradeTPSL attempt 1 failed for trade ${tradeId}:`,
      err1
    );
    // Wait 500ms then retry once
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await attempt(2);
    } catch (err2) {
      // Both attempts failed — log CRITICAL so it is visible in Railway
      console.error(
        `[OANDA] CRITICAL: patchTradeTPSL both attempts failed ` +
        `for trade ${tradeId}. Trade has no TP order on OANDA. ` +
        `TP=${takeProfitPrice} SL=${stopLossPrice}`,
        err2
      );
      // Do NOT throw — bridge must continue processing other signals
    }
  }
}

export function getAccountId(): string {
  if (!OANDA_ACCOUNT_ID) throw new Error('OANDA_ACCOUNT_ID not set');
  return OANDA_ACCOUNT_ID;
}
