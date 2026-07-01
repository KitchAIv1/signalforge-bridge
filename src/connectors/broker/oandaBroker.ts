/**
 * OandaBroker — BrokerClient adapter over src/connectors/oanda.ts (zero logic change).
 */

import * as oanda from '../oanda.js';
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
import { toOandaInstrument } from '../../utils/pairs.js';

export function createOandaBroker(config: BrokerClientConfig): BrokerClient {
  const accountId = config.accountId ?? oanda.getAccountId();

  return {
    brokerId: config.brokerId,
    brokerType: 'oanda',

    getAccountSummary(): Promise<AccountSummary> {
      return oanda.getAccountSummary(accountId);
    },

    getOpenTrades(): Promise<OpenTrade[]> {
      return oanda.getOpenTrades();
    },

    placeMarketOrder(params: PlaceOrderParams, timeoutMs?: number): Promise<PlaceOrderResult> {
      return oanda.placeMarketOrder(params, timeoutMs, accountId);
    },

    patchTradeTPSL(tradeId: string, takeProfit: string, stopLoss: string): Promise<void> {
      return oanda.patchTradeTPSL(tradeId, takeProfit, stopLoss);
    },

    closeTrade(tradeId: string, units?: string): Promise<CloseTradeResult> {
      return oanda.closeTrade(tradeId, units, accountId);
    },

    getTradeById(tradeId: string): Promise<TradeByIdDetails | null> {
      return oanda.getTradeById(tradeId, accountId);
    },

    fetchCompletedCandles(
      pair: string,
      granularity: 'D' | 'H4' | 'M5' | 'H1',
      fromISO: string,
      toISO: string,
    ): Promise<CompletedCandle[]> {
      return oanda.fetchCompletedCandles(pair, granularity, fromISO, toISO);
    },

    fetchLatestM5Candle(instrument: string): Promise<LatestM5Candle | null> {
      return oanda.fetchLatestM5Candle(instrument);
    },

    toBrokerInstrument(bridgeInstrument: string): string {
      return toOandaInstrument(bridgeInstrument);
    },

    toBrokerOrderSize(units: number, _instrument: string): number {
      return units;
    },

    fromBrokerOrderSize(brokerSize: number, _instrument: string): number {
      return brokerSize;
    },
  };
}
