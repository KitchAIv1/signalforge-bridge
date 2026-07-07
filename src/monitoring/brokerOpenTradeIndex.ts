/**
 * Build per-broker sets of open trade/ticket IDs for trade monitor sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpenTrade } from '../connectors/broker/types.js';
import { createOandaBroker } from '../connectors/broker/oandaBroker.js';
import { createBrokerClient } from '../connectors/broker/brokerFactory.js';
import { getOpenTrades as getOandaOpenTrades } from '../connectors/oanda.js';

const OANDA_DEFAULT = 'oanda_practice';

function tradeIdsFromRows(trades: OpenTrade[]): Set<string> {
  return new Set(trades.map((trade) => trade.id).filter(Boolean));
}

async function fetchBrokerOpenIds(
  supabase: SupabaseClient,
  brokerId: string,
  engineId: string,
): Promise<Set<string>> {
  if (brokerId === OANDA_DEFAULT) {
    const trades = await getOandaOpenTrades();
    return tradeIdsFromRows(trades);
  }

  const { data } = await supabase
    .from('bridge_brokers')
    .select('broker_id, broker_type, account_id, is_active')
    .eq('broker_id', brokerId)
    .maybeSingle();

  if (!data) return new Set();

  const client = createBrokerClient(
    data as { broker_id: string; broker_type: string; account_id: string | null; is_active: boolean },
    engineId,
  );
  if (!client) return new Set();

  try {
    const trades = await client.getOpenTrades();
    return tradeIdsFromRows(trades);
  } catch (err) {
    console.warn('[TradeMonitor] broker open trades fetch failed', brokerId, String(err));
    return new Set();
  }
}

export interface BrokerOpenTradeIndex {
  /** Default OANDA practice ids (backward compatible). */
  oandaIds: Set<string>;
  /** broker_id → open ticket/trade ids at that venue. */
  byBroker: Map<string, Set<string>>;
}

export async function buildBrokerOpenTradeIndex(
  supabase: SupabaseClient,
  logOpenRows: Array<{ broker_id?: string | null; engine_id?: string | null }>,
): Promise<BrokerOpenTradeIndex> {
  const oandaBroker = createOandaBroker({
    brokerId: OANDA_DEFAULT,
    brokerType: 'oanda',
    accountId: process.env.OANDA_ACCOUNT_ID,
  });
  let oandaIds: Set<string>;
  try {
    oandaIds = tradeIdsFromRows(await oandaBroker.getOpenTrades());
  } catch {
    oandaIds = tradeIdsFromRows(await getOandaOpenTrades());
  }

  const byBroker = new Map<string, Set<string>>();
  byBroker.set(OANDA_DEFAULT, oandaIds);

  const brokerEnginePairs = new Map<string, string>();
  for (const row of logOpenRows) {
    const brokerId = (row.broker_id as string | null) ?? OANDA_DEFAULT;
    const engineId = (row.engine_id as string) ?? 'omega';
    if (!brokerEnginePairs.has(brokerId)) brokerEnginePairs.set(brokerId, engineId);
  }

  for (const [brokerId, engineId] of brokerEnginePairs) {
    if (brokerId === OANDA_DEFAULT) continue;
    byBroker.set(brokerId, await fetchBrokerOpenIds(supabase, brokerId, engineId));
  }

  return { oandaIds, byBroker };
}

export function openIdsForLogRow(
  index: BrokerOpenTradeIndex,
  brokerId: string | null | undefined,
): Set<string> {
  const key = brokerId ?? OANDA_DEFAULT;
  return index.byBroker.get(key) ?? index.oandaIds;
}
