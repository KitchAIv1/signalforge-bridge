/**
 * Broker-aware trade close + closed-details for trade monitor.
 */

import type { BrokerClient } from '../connectors/broker/types.js';
import { getClosedTradeDetails } from '../connectors/oanda.js';
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

/**
 * Resolve close details for a trade missing from the open list.
 * OANDA: use getClosedTradeDetails (trade-by-id + transactions fallback) so
 * purged CLOSED trades (404 on /trades/{id}) still finalize — Lane B #210.
 * MT5: keep getTradeById only.
 */
export async function fetchClosedTradeSnapshotViaBroker(
  broker: BrokerClient,
  tradeId: string,
  openTime: string,
): Promise<ClosedTradeSnapshot> {
  if (broker.brokerType === 'oanda') {
    const details = await getClosedTradeDetails(
      tradeId,
      openTime,
      oandaAccountIdForBroker(broker.brokerId),
    );
    return {
      closedTime: details.closedTime,
      exitPrice: details.exitPrice,
      pnlDollars: details.pnlDollars,
    };
  }

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

function oandaAccountIdForBroker(brokerId: string): string | undefined {
  if (brokerId === 'oanda_phase2_demo') {
    return process.env.OANDA_PHASE2_ACCOUNT_ID?.trim() || undefined;
  }
  return undefined;
}
