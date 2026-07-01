/**
 * BrokerClient — shared execution interface for OANDA and MT5 (MetaApi).
 */

export type BrokerType = 'oanda' | 'mt5';

export interface AccountSummary {
  balance: number;
  equity: number;
  unrealizedPL: number;
  marginUsed: number;
  marginAvailable: number;
  openTradeCount: number;
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

export interface PriceQuote {
  instrument: string;
  bid: string;
  ask: string;
  spread: string;
}

export interface PlaceOrderParams {
  instrument: string;
  units: number;
  priceBound?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
  /** MT5: strategy magic number */
  magicNumber?: number;
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

export interface CloseTradeResult {
  orderFillTransaction?: { price?: string; pl?: string; time?: string };
  orderCancelTransaction?: { reason?: string };
}

export interface ClosedTradeDetails {
  exitPrice: number | null;
  pnlDollars: number | null;
  closedTime: string | null;
}

export interface TradeByIdDetails {
  tradeId: string;
  state: 'OPEN' | 'CLOSED' | 'CLOSE_WHEN_TRADEABLE';
  instrument: string;
  units: string;
  openTime: string;
  closeTime: string | null;
  averageClosePrice: number | null;
  realizedPL: number | null;
  unrealizedPL: number | null;
  currentUnits: string;
}

export interface CompletedCandle {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  complete: boolean;
}

export interface LatestM5Candle {
  high: number;
  low: number;
  close: number;
  time: string;
}

export interface BrokerClientConfig {
  brokerId: string;
  brokerType: BrokerType;
  accountId?: string;
  symbolSuffix?: string;
  magicNumber?: number;
}

export interface BrokerClient {
  readonly brokerId: string;
  readonly brokerType: BrokerType;
  getAccountSummary(): Promise<AccountSummary>;
  getOpenTrades(): Promise<OpenTrade[]>;
  placeMarketOrder(params: PlaceOrderParams, timeoutMs?: number): Promise<PlaceOrderResult>;
  patchTradeTPSL(tradeId: string, takeProfit: string, stopLoss: string): Promise<void>;
  closeTrade(tradeId: string, units?: string): Promise<CloseTradeResult>;
  getTradeById(tradeId: string): Promise<TradeByIdDetails | null>;
  fetchCompletedCandles(
    pair: string,
    granularity: 'D' | 'H4' | 'M5' | 'H1',
    fromISO: string,
    toISO: string,
  ): Promise<CompletedCandle[]>;
  fetchLatestM5Candle(instrument: string): Promise<LatestM5Candle | null>;
  toBrokerInstrument(bridgeInstrument: string): string;
  /** Convert bridge unit count to broker order size (lots for MT5, units for OANDA). */
  toBrokerOrderSize(units: number, instrument: string): number;
  /** Convert broker fill size back to bridge units. */
  fromBrokerOrderSize(brokerSize: number, instrument: string): number;
}
