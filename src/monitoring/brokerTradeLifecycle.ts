/**
 * Broker-aware trade close + closed-details for trade monitor.
 */

import type { BrokerClient } from '../connectors/broker/types.js';
import { getClosedTradeDetails } from '../connectors/oanda.js';

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
  openTime: string,
): Promise<ClosedTradeSnapshot> {
  if (broker.brokerType === 'oanda') {
    const details = await getClosedTradeDetails(tradeId, openTime);
    return {
      closedTime: details.closedTime ?? new Date().toISOString(),
      exitPrice: details.exitPrice != null ? parseFloat(String(details.exitPrice)) : null,
      pnlDollars: details.pnlDollars,
    };
  }

  const trade = await broker.getTradeById(tradeId);
  if (!trade || trade.state === 'OPEN') {
    return { closedTime: null, exitPrice: null, pnlDollars: null };
  }
  return {
    closedTime: trade.closeTime ?? new Date().toISOString(),
    exitPrice: trade.averageClosePrice,
    pnlDollars: trade.realizedPL,
  };
}
