/**
 * Reconstructs closed-trade details for an MT5 position from its deal history.
 *
 * rpc.getPosition(id) only returns LIVE positions — once a position closes
 * (manual close, broker-side SL/TP, liquidation, etc.) it 404s. Without this
 * fallback, the bridge can never learn a non-OANDA trade closed, and
 * bridge_trade_log rows stay stuck at status='open' forever (verified
 * incident: 2026-07-01, ticket 485392685).
 */

import type { TradeByIdDetails } from './types.js';
import { mt5LotsToUnits } from './lotConverter.js';

type Deal = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Volume-weighted average close price and total realized P&L across every
 * DEAL_ENTRY_OUT (and DEAL_ENTRY_OUT_BY, for hedge closes) deal on the position.
 */
function summarizeCloseDeals(deals: Deal[]): { price: number; time: string; realizedPL: number } | null {
  const outDeals = deals.filter((d) => {
    const entryType = String(d.entryType ?? '');
    return entryType === 'DEAL_ENTRY_OUT' || entryType === 'DEAL_ENTRY_OUT_BY';
  });
  if (outDeals.length === 0) return null;

  const totalVolume = outDeals.reduce((sum, d) => sum + num(d.volume), 0);
  const weightedPrice =
    totalVolume > 0
      ? outDeals.reduce((sum, d) => sum + num(d.price) * num(d.volume), 0) / totalVolume
      : num(outDeals[outDeals.length - 1]!.price);

  // Realized P&L is realized across the whole position's deal history, not just
  // the OUT deals — entry-side commission/swap also contribute.
  const realizedPL = deals.reduce(
    (sum, d) => sum + num(d.profit) + num(d.commission) + num(d.swap),
    0,
  );

  const lastCloseTime = outDeals
    .map((d) => String(d.time ?? d.brokerTime ?? ''))
    .filter(Boolean)
    .sort()
    .pop();

  return {
    price: weightedPrice,
    time: lastCloseTime ?? new Date().toISOString(),
    realizedPL,
  };
}

export function buildClosedTradeDetailsFromDeals(
  positionId: string,
  deals: Deal[],
): TradeByIdDetails | null {
  const closeSummary = summarizeCloseDeals(deals);
  if (!closeSummary) return null;

  const inDeal = deals.find((d) => String(d.entryType ?? '') === 'DEAL_ENTRY_IN');
  const volumeLots = inDeal ? num(inDeal.volume) : num(deals[0]?.volume);
  const isSell = String(inDeal?.type ?? '').includes('SELL');
  const signedUnits = isSell ? -mt5LotsToUnits(volumeLots) : mt5LotsToUnits(volumeLots);

  return {
    tradeId: positionId,
    state: 'CLOSED',
    instrument: String(inDeal?.symbol ?? deals[0]?.symbol ?? ''),
    units: String(signedUnits),
    currentUnits: '0',
    openTime: String(inDeal?.time ?? inDeal?.brokerTime ?? ''),
    closeTime: closeSummary.time,
    averageClosePrice: closeSummary.price,
    realizedPL: closeSummary.realizedPL,
    unrealizedPL: null,
  };
}
