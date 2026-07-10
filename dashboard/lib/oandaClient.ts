import { assertOandaServerEnvForBroker } from '@/lib/oandaServerEnv';
import { OMEGA_LANE_A_BROKER_ID } from '@/lib/overrideBrokerScope';
import { oandaDashboardFetch, readOandaErrorBody } from '@/lib/oandaHttp';
import type { AccountSnapshot } from '@/lib/accountSnapshotService';

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

function resolveBroker(brokerId?: string): string {
  return brokerId?.trim() || OMEGA_LANE_A_BROKER_ID;
}

export async function fetchOpenTrades(brokerId?: string): Promise<LiveTrade[]> {
  const env = assertOandaServerEnvForBroker(resolveBroker(brokerId));
  const res = await oandaDashboardFetch(
    `/v3/accounts/${env.accountId}/openTrades`,
    undefined,
    env,
  );
  if (!res.ok) {
    const detail = await readOandaErrorBody(res);
    throw new Error(`OANDA openTrades failed (${env.brokerId}) — ${detail}`);
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

export async function fetchAccountSnapshot(brokerId?: string): Promise<AccountSnapshot> {
  const env = assertOandaServerEnvForBroker(resolveBroker(brokerId));
  const res = await oandaDashboardFetch(
    `/v3/accounts/${env.accountId}/summary`,
    undefined,
    env,
  );
  if (!res.ok) {
    const detail = await readOandaErrorBody(res);
    throw new Error(`OANDA account summary failed (${env.brokerId}) — ${detail}`);
  }
  const json = (await res.json()) as {
    account?: {
      balance?: string;
      NAV?: string;
      unrealizedPL?: string;
      marginUsed?: string;
      marginAvailable?: string;
      openTradeCount?: string | number;
    };
  };
  const account = json.account ?? {};
  return {
    balance: Number(account.balance ?? 0),
    equity: Number(account.NAV ?? account.balance ?? 0),
    unrealizedPL: Number(account.unrealizedPL ?? 0),
    marginUsed: Number(account.marginUsed ?? 0),
    marginAvailable: Number(account.marginAvailable ?? 0),
    openTradeCount: Number(account.openTradeCount ?? 0),
    checkedAt: new Date().toISOString(),
  };
}

export async function closeTradeById(tradeId: string, brokerId?: string): Promise<void> {
  const env = assertOandaServerEnvForBroker(resolveBroker(brokerId));
  const res = await oandaDashboardFetch(
    `/v3/accounts/${env.accountId}/trades/${tradeId}/close`,
    { method: 'PUT' },
    env,
  );
  if (!res.ok) {
    const detail = await readOandaErrorBody(res);
    throw new Error(`OANDA close trade failed (${env.brokerId}) — ${detail}`);
  }
}

export async function closeAllTrades(
  tradeIds: string[],
  brokerId?: string,
): Promise<void> {
  await Promise.all(tradeIds.map((tradeId) => closeTradeById(tradeId, brokerId)));
}
