/**
 * MetaApi session pool — synchronized RPC + account per MT5 account.
 */

type RpcConnection = {
  connect(): Promise<void>;
  waitSynchronized(): Promise<void>;
  getAccountInformation(): Promise<Record<string, unknown>>;
  getPositions(): Promise<Array<Record<string, unknown>>>;
  getPosition(positionId: string): Promise<Record<string, unknown>>;
  createMarketBuyOrder(
    symbol: string,
    volume: number,
    stopLoss?: number,
    takeProfit?: number,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  createMarketSellOrder(
    symbol: string,
    volume: number,
    stopLoss?: number,
    takeProfit?: number,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  closePosition(positionId: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  modifyPosition(positionId: string, stopLoss?: number, takeProfit?: number): Promise<Record<string, unknown>>;
  getSymbols(): Promise<string[]>;
};

type MetaApiAccount = {
  deploy(): Promise<void>;
  waitConnected(): Promise<void>;
  getRPCConnection(): RpcConnection;
  getHistoricalCandles(
    symbol: string,
    timeframe: string,
    startTime?: Date,
    limit?: number,
  ): Promise<Array<Record<string, unknown>>>;
};

export interface Mt5Session {
  rpc: RpcConnection;
  getHistoricalCandles(
    symbol: string,
    timeframe: string,
    startTime?: Date,
    limit?: number,
  ): Promise<Array<Record<string, unknown>>>;
}

const sessionByAccountId = new Map<string, Promise<Mt5Session>>();

function resolveMetaApiToken(): string {
  const token = process.env.METAAPI_TOKEN?.trim();
  if (!token) throw new Error('METAAPI_TOKEN is not set');
  return token;
}

async function loadMetaApiModule(): Promise<{ default: new (token: string) => unknown }> {
  const mod = await import('metaapi.cloud-sdk/esm-node');
  return mod as { default: new (token: string) => unknown };
}

async function openMt5Session(metaApiAccountId: string): Promise<Mt5Session> {
  const MetaApi = (await loadMetaApiModule()).default;
  const api = new MetaApi(resolveMetaApiToken()) as {
    metatraderAccountApi: {
      getAccount(id: string): Promise<MetaApiAccount>;
    };
  };
  const account = await api.metatraderAccountApi.getAccount(metaApiAccountId);
  await account.deploy();
  await account.waitConnected();
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized();
  return {
    rpc,
    getHistoricalCandles: (symbol, timeframe, startTime, limit) =>
      account.getHistoricalCandles(symbol, timeframe, startTime, limit),
  };
}

export async function getMt5Session(metaApiAccountId: string): Promise<Mt5Session> {
  const cached = sessionByAccountId.get(metaApiAccountId);
  if (cached) return cached;
  const pending = openMt5Session(metaApiAccountId);
  sessionByAccountId.set(metaApiAccountId, pending);
  try {
    return await pending;
  } catch (err) {
    sessionByAccountId.delete(metaApiAccountId);
    throw err;
  }
}

export async function getMt5RpcConnection(metaApiAccountId: string): Promise<RpcConnection> {
  return (await getMt5Session(metaApiAccountId)).rpc;
}

export function clearMt5RpcPool(): void {
  sessionByAccountId.clear();
}
