/** Resolve BrokerClient for an open peak_fade trade. */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBrokerClient,
  type BridgeBrokerRow,
} from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { loadExecutionRoutes } from '../broker/brokerLinkService.js';
import { PEAK_FADE_ENGINE_ID } from './peakFadeConstants.js';

export async function resolveBrokerForPeakFadeTrade(
  supabase: SupabaseClient,
  brokerId: string | null | undefined,
): Promise<BrokerClient> {
  const routes = await loadExecutionRoutes(supabase, PEAK_FADE_ENGINE_ID);
  if (brokerId) {
    const match = routes.find((route) => route.brokerId === brokerId);
    if (match) return match.broker;
  }
  if (routes[0]) return routes[0].broker;

  // Fallback: load broker row directly if links missing mid-flight.
  if (brokerId) {
    const { data } = await supabase
      .from('bridge_brokers')
      .select('broker_id, broker_type, account_id, is_active, symbol_suffix')
      .eq('broker_id', brokerId)
      .maybeSingle();
    if (data) {
      const client = createBrokerClient(data as BridgeBrokerRow, PEAK_FADE_ENGINE_ID);
      if (client) return client;
    }
  }
  throw new Error(`peak_fade: no broker client for ${brokerId ?? 'null'}`);
}
