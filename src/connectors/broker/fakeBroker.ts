/**
 * In-memory fake BrokerClient for contract tests (no network).
 */

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

export interface FakeBrokerState {
  equity: number;
  openTrades: Map<string, OpenTrade>;
  placeOrderCalls: PlaceOrderParams[];
  closeCalls: string[];
  shouldTimeout: boolean;
  shouldCancel: boolean;
  cancelReason: string;
}

export function createFakeBroker(
  config: BrokerClientConfig,
  state: FakeBrokerState,
): BrokerClient {
  let ticketCounter = 1000;

  return {
    brokerId: config.brokerId,
    brokerType: config.brokerType,

    async getAccountSummary(): Promise<AccountSummary> {
      return {
        balance: state.equity,
        equity: state.equity,
        unrealizedPL: 0,
        marginUsed: 0,
        marginAvailable: state.equity,
        openTradeCount: state.openTrades.size,
      };
    },

    async getOpenTrades(): Promise<OpenTrade[]> {
      return [...state.openTrades.values()];
    },

    async placeMarketOrder(params: PlaceOrderParams, timeoutMs?: number): Promise<PlaceOrderResult> {
      state.placeOrderCalls.push(params);
      if (state.shouldTimeout) {
        await new Promise<void>((resolve) => setTimeout(resolve, (timeoutMs ?? 100) + 50));
        throw new Error('ORDER_TIMEOUT');
      }
      if (state.shouldCancel) {
        return { orderCancelTransaction: { reason: state.cancelReason } };
      }
      const tradeId = String(++ticketCounter);
      state.openTrades.set(tradeId, {
        id: tradeId,
        instrument: params.instrument,
        units: String(params.units),
        openTime: new Date().toISOString(),
      });
      return {
        orderFillTransaction: {
          id: tradeId,
          tradeOpened: { tradeID: tradeId, units: String(params.units) },
          price: '0.65000',
          units: String(params.units),
        },
      };
    },

    async patchTradeTPSL(): Promise<void> {
      return;
    },

    async closeTrade(tradeId: string): Promise<CloseTradeResult> {
      state.closeCalls.push(tradeId);
      state.openTrades.delete(tradeId);
      return {
        orderFillTransaction: {
          price: '0.65100',
          pl: '10.00',
          time: new Date().toISOString(),
        },
      };
    },

    async getTradeById(tradeId: string): Promise<TradeByIdDetails | null> {
      const open = state.openTrades.get(tradeId);
      if (open) {
        return {
          tradeId,
          state: 'OPEN',
          instrument: open.instrument,
          units: open.units,
          currentUnits: open.units,
          openTime: open.openTime,
          closeTime: null,
          averageClosePrice: null,
          realizedPL: null,
          unrealizedPL: null,
        };
      }
      return {
        tradeId,
        state: 'CLOSED',
        instrument: 'AUD_USD',
        units: '0',
        currentUnits: '0',
        openTime: new Date().toISOString(),
        closeTime: new Date().toISOString(),
        averageClosePrice: 0.651,
        realizedPL: 10,
        unrealizedPL: null,
      };
    },

    async fetchCompletedCandles(): Promise<CompletedCandle[]> {
      return [];
    },

    async fetchLatestM5Candle(): Promise<LatestM5Candle | null> {
      return { high: 0.651, low: 0.649, close: 0.65, time: new Date().toISOString() };
    },

    toBrokerInstrument(bridgeInstrument: string): string {
      return bridgeInstrument.replace('_', '');
    },

    toBrokerOrderSize(units: number): number {
      return units;
    },

    fromBrokerOrderSize(brokerSize: number): number {
      return brokerSize;
    },
  };
}
