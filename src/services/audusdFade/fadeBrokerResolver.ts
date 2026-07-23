/**
 * Resolve BrokerClient for a fade trade row by broker_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrokerClient } from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { createOandaBroker } from '../../connectors/broker/oandaBroker.js';
import { logWarn } from '../../utils/logger.js';

export async function resolveBrokerForFadeTrade(
  supabase: SupabaseClient,
  brokerId: string | null | undefined,
): Promise<BrokerClient> {
  const resolvedId = brokerId ?? 'oanda_practice';
  const { data } = await supabase
    .from('bridge_brokers')
    .select('broker_id, broker_type, account_id, is_active, symbol_suffix')
    .eq('broker_id', resolvedId)
    .maybeSingle();

  if (data) {
    const client = createBrokerClient(
      data as { broker_id: string; broker_type: string; account_id: string | null; is_active: boolean },
      'audusd_fade',
    );
    if (client) return client;
    if (data.broker_type === 'mt5') {
      const message =
        `MT5 broker ${resolvedId} unavailable (MT5_ENABLED / account UUID / METAAPI_TOKEN)`;
      logWarn('[resolveBrokerForFadeTrade] ' + message, { brokerId: resolvedId });
      throw new Error(message);
    }
  }

  if (resolvedId.startsWith('vtmarkets_')) {
    const message = `MT5 broker ${resolvedId} row missing or inactive`;
    logWarn('[resolveBrokerForFadeTrade] ' + message, { brokerId: resolvedId });
    throw new Error(message);
  }

  return createOandaBroker({
    brokerId: 'oanda_practice',
    brokerType: 'oanda',
    accountId: process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID,
  });
}
