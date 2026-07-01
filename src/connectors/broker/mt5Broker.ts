/**
 * Mt5Broker — BrokerClient over MetaApi RPC (VT Markets and other MT5 brokers).
 */

import { getMt5Session } from './mt5RpcPool.js';
import { placeMt5MarketOrder } from './mt5OrderHelpers.js';
import { bridgeInstrumentToMt5, mt5SymbolToBridgeInstrument } from './symbolMapping.js';
import { clampMt5Lots, mt5LotsToUnits, unitsToMt5Lots } from './lotConverter.js';
import type {
  AccountSummary,
  BrokerClient,
  BrokerClientConfig,
  CloseTradeResult,
  CompletedCandle,
  LatestM5Candle,
  OpenTrade,
  PlaceOrderParams,
  PlaceOrderResult,
  TradeByIdDetails,
} from './types.js';

function parseRpcAccountInfo(raw: Record<string, unknown>): AccountSummary {
  return {
    balance: Number(raw.balance ?? 0),
    equity: Number(raw.equity ?? raw.balance ?? 0),
    unrealizedPL: Number(raw.profit ?? raw.unrealizedProfit ?? 0),
    marginUsed: Number(raw.margin ?? 0),
    marginAvailable: Number(raw.freeMargin ?? raw.marginFree ?? 0),
    openTradeCount: Number(raw.openPositions ?? 0),
  };
}

function mapPositionToOpenTrade(pos: Record<string, unknown>): OpenTrade {
  const symbol = String(pos.symbol ?? '');
  const volume = Number(pos.volume ?? 0);
  const type = String(pos.type ?? '');
  const signedUnits = type.includes('BUY') ? mt5LotsToUnits(volume) : -mt5LotsToUnits(volume);
  return {
    id: String(pos.id ?? pos.positionId ?? ''),
    instrument: mt5SymbolToBridgeInstrument(symbol),
    units: String(signedUnits),
    openTime: String(pos.time ?? pos.openTime ?? new Date().toISOString()),
    unrealizedPL: pos.profit != null ? String(pos.profit) : undefined,
  };
}

export function createMt5Broker(config: BrokerClientConfig): BrokerClient {
  const metaApiAccountId = config.accountId?.trim();
  if (!metaApiAccountId) {
    throw new Error(`Mt5Broker ${config.brokerId}: accountId (MetaApi account id) required`);
  }
  const accountId: string = metaApiAccountId;
  const symbolSuffix = config.symbolSuffix ?? process.env.VT_SYMBOL_SUFFIX ?? '-STD';
  const magicNumber = config.magicNumber ?? 88000;

  async function session() {
    return getMt5Session(accountId);
  }

  return {
    brokerId: config.brokerId,
    brokerType: 'mt5',

    async getAccountSummary(): Promise<AccountSummary> {
      const { rpc } = await session();
      const info = await rpc.getAccountInformation();
      return parseRpcAccountInfo(info);
    },

    async getOpenTrades(): Promise<OpenTrade[]> {
      const { rpc } = await session();
      const positions = await rpc.getPositions();
      return positions.map(mapPositionToOpenTrade);
    },

    async placeMarketOrder(params: PlaceOrderParams, _timeoutMs?: number): Promise<PlaceOrderResult> {
      const { rpc } = await session();
      const brokerSymbol = bridgeInstrumentToMt5(params.instrument, symbolSuffix);
      const lots = unitsToMt5Lots(params.units);
      return placeMt5MarketOrder(rpc, { ...params, magicNumber }, brokerSymbol, lots);
    },

    async patchTradeTPSL(tradeId: string, takeProfit: string, stopLoss: string): Promise<void> {
      const { rpc } = await session();
      await rpc.modifyPosition(tradeId, Number(stopLoss), Number(takeProfit));
    },

    async closeTrade(tradeId: string): Promise<CloseTradeResult> {
      const { rpc } = await session();
      const result = await rpc.closePosition(tradeId);
      return {
        orderFillTransaction: {
          price: result.price != null ? String(result.price) : undefined,
          pl: result.profit != null ? String(result.profit) : undefined,
          time: result.time != null ? String(result.time) : undefined,
        },
      };
    },

    async getTradeById(tradeId: string): Promise<TradeByIdDetails | null> {
      try {
        const { rpc } = await session();
        const pos = await rpc.getPosition(tradeId);
        if (!pos) return null;
        const volume = Number(pos.volume ?? 0);
        const type = String(pos.type ?? '');
        const signedUnits = type.includes('BUY') ? mt5LotsToUnits(volume) : -mt5LotsToUnits(volume);
        return {
          tradeId,
          state: 'OPEN',
          instrument: mt5SymbolToBridgeInstrument(String(pos.symbol ?? '')),
          units: String(signedUnits),
          currentUnits: String(signedUnits),
          openTime: String(pos.time ?? ''),
          closeTime: null,
          averageClosePrice: null,
          realizedPL: null,
          unrealizedPL: pos.profit != null ? Number(pos.profit) : null,
        };
      } catch {
        return null;
      }
    },

    async fetchCompletedCandles(
      pair: string,
      granularity: 'D' | 'H4' | 'M5' | 'H1',
      fromISO: string,
      toISO: string,
    ): Promise<CompletedCandle[]> {
      const tfMap: Record<string, string> = {
        M5: '5m',
        H1: '1h',
        H4: '4h',
        D: '1d',
      };
      const { getHistoricalCandles } = await session();
      const symbol = bridgeInstrumentToMt5(pair, symbolSuffix);
      const startTime = new Date(fromISO);
      const endMs = new Date(toISO).getTime();
      const limit = 500;
      const raw = await getHistoricalCandles(symbol, tfMap[granularity] ?? '5m', startTime, limit);
      return raw
        .filter((c) => {
          const t = new Date(String(c.time ?? 0)).getTime();
          return t <= endMs;
        })
        .map((c) => ({
          time: new Date(String(c.time)).toISOString(),
          mid: {
            o: String(c.open ?? c.o ?? 0),
            h: String(c.high ?? c.h ?? 0),
            l: String(c.low ?? c.l ?? 0),
            c: String(c.close ?? c.c ?? 0),
          },
          complete: true,
        }));
    },

    async fetchLatestM5Candle(instrument: string): Promise<LatestM5Candle | null> {
      const symbol = bridgeInstrumentToMt5(instrument, symbolSuffix);
      const { getHistoricalCandles } = await session();
      const raw = await getHistoricalCandles(symbol, '5m', new Date(Date.now() - 30 * 60_000), 3);
      const last = raw[raw.length - 1];
      if (!last) return null;
      return {
        high: Number(last.high ?? last.h ?? 0),
        low: Number(last.low ?? last.l ?? 0),
        close: Number(last.close ?? last.c ?? 0),
        time: new Date(String(last.time)).toISOString(),
      };
    },

    toBrokerInstrument(bridgeInstrument: string): string {
      return bridgeInstrumentToMt5(bridgeInstrument, symbolSuffix);
    },

    toBrokerOrderSize(units: number, _instrument: string): number {
      return clampMt5Lots(unitsToMt5Lots(units), 0.01, 0.01);
    },

    fromBrokerOrderSize(brokerSize: number, _instrument: string): number {
      return mt5LotsToUnits(brokerSize);
    },
  };
}
