import type { LiveTrade } from '@/lib/oandaClient';

export type EnrichedLiveTrade = LiveTrade & {
  legType: string | null;
  signalId: string | null;
  engineId: string | null;
};

type TradeLogLegRow = {
  oanda_trade_id: string;
  leg_type: string | null;
  signal_id: string | null;
  engine_id: string | null;
};

export function enrichOpenTradesWithLegMetadata(
  trades: LiveTrade[],
  logRows: TradeLogLegRow[] | null,
): EnrichedLiveTrade[] {
  const legMap = new Map(logRows?.map((row) => [row.oanda_trade_id, row]) ?? []);

  return trades.map((trade) => {
    const logRow = legMap.get(trade.id);
    return {
      ...trade,
      legType: logRow?.leg_type ?? null,
      signalId: logRow?.signal_id ?? null,
      engineId: logRow?.engine_id ?? null,
    };
  });
}

export type SignalLegGroup = {
  signalId: string;
  engineId: string | null;
  trades: EnrichedLiveTrade[];
};

export function groupEnrichedTradesBySignal(
  trades: EnrichedLiveTrade[],
): { grouped: SignalLegGroup[]; ungrouped: EnrichedLiveTrade[] } {
  const groupedMap = new Map<string, SignalLegGroup>();
  const ungrouped: EnrichedLiveTrade[] = [];

  for (const trade of trades) {
    if (trade.signalId) {
      const existing = groupedMap.get(trade.signalId);
      if (existing) {
        existing.trades.push(trade);
      } else {
        groupedMap.set(trade.signalId, {
          signalId: trade.signalId,
          engineId: trade.engineId,
          trades: [trade],
        });
      }
    } else {
      ungrouped.push(trade);
    }
  }

  return { grouped: [...groupedMap.values()], ungrouped };
}
