/**
 * Broker-aware trade close + closed-details for trade monitor.
 */

import type { BrokerClient } from '../connectors/broker/types.js';
import { normalizeBrokerTimestamp } from '../connectors/broker/normalizeBrokerTimestamp.js';

export interface ClosedTradeSnapshot {
  closedTime: string | null;
  exitPrice: number | null;
  pnlDollars: number | null;
}

export async function closeTradeViaBroker(
  broker: BrokerClient,
  tradeId: string,
): Promise<{ closedAt: string; pnlDollars: number | null; exitPriceNum: number | null }> {
  const closeResult = await broker.closeTrade(tradeId);
  const fillTx = closeResult.orderFillTransaction;
  return {
    closedAt: fillTx?.time ?? new Date().toISOString(),
    pnlDollars: fillTx?.pl != null ? parseFloat(String(fillTx.pl)) : null,
    exitPriceNum: fillTx?.price != null ? parseFloat(String(fillTx.price)) : null,
  };
}

export async function fetchClosedTradeSnapshotViaBroker(
  broker: BrokerClient,
  tradeId: string,
  _openTime: string,
): Promise<ClosedTradeSnapshot> {
  const trade = await broker.getTradeById(tradeId);
  if (!trade || trade.state !== 'CLOSED') {
    return { closedTime: null, exitPrice: null, pnlDollars: null };
  }
  return {
    closedTime: normalizeBrokerTimestamp(trade.closeTime ?? new Date()),
    exitPrice: trade.averageClosePrice,
    pnlDollars: trade.realizedPL,
  };
}
