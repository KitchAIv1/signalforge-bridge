/**
 * Load active execution routes (engine → broker) from bridge_links + bridge_brokers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrokerClient, type BridgeBrokerRow } from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { createOandaBroker } from '../../connectors/broker/oandaBroker.js';

export interface EngineBrokerRoute {
  brokerId: string;
  broker: BrokerClient;
  capitalAllocationPct: number;
}

async function fetchActiveLinks(
  supabase: SupabaseClient,
  engineId: string,
): Promise<Array<{ broker_id: string; capital_allocation_pct: number }>> {
  const { data, error } = await supabase
    .from('bridge_links')
    .select('broker_id, capital_allocation_pct')
    .eq('engine_id', engineId)
    .eq('is_active', true);
  if (error) throw new Error(`loadExecutionRoutes links: ${error.message}`);
  return (data ?? []) as Array<{ broker_id: string; capital_allocation_pct: number }>;
}

async function fetchBrokerRows(
  supabase: SupabaseClient,
  brokerIds: string[],
): Promise<BridgeBrokerRow[]> {
  if (!brokerIds.length) return [];
  const { data, error } = await supabase
    .from('bridge_brokers')
    .select('broker_id, broker_type, account_id, is_active')
    .in('broker_id', brokerIds)
    .eq('is_active', true);
  if (error) throw new Error(`loadExecutionRoutes brokers: ${error.message}`);
  return (data ?? []) as BridgeBrokerRow[];
}

function defaultOandaRoute(engineId: string): EngineBrokerRoute {
  return {
    brokerId: 'oanda_practice',
    broker: createOandaBroker({
      brokerId: 'oanda_practice',
      brokerType: 'oanda',
      accountId:
        engineId === 'audusd_fade'
          ? process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID
          : process.env.OANDA_ACCOUNT_ID,
    }),
    capitalAllocationPct: 1,
  };
}

export async function loadExecutionRoutes(
  supabase: SupabaseClient,
  engineId: string,
): Promise<EngineBrokerRoute[]> {
  const links = await fetchActiveLinks(supabase, engineId);
  if (!links.length) return [defaultOandaRoute(engineId)];

  const brokerRows = await fetchBrokerRows(
    supabase,
    links.map((link) => link.broker_id),
  );
  const pctByBroker = new Map(links.map((link) => [link.broker_id, link.capital_allocation_pct]));
  const routes: EngineBrokerRoute[] = [];

  for (const row of brokerRows) {
    const client = createBrokerClient(row, engineId);
    if (!client) continue;
    routes.push({
      brokerId: row.broker_id,
      broker: client,
      capitalAllocationPct: pctByBroker.get(row.broker_id) ?? 1,
    });
  }

  if (!routes.length) return [defaultOandaRoute(engineId)];
  return routes;
}
