import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrokerClient } from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { createOandaBroker } from '../../connectors/broker/oandaBroker.js';
import { PDL_WINDOW_ENGINE_ID } from './pdlWindowConstants.js';

export async function resolveBrokerForPdlTrade(
  supabase: SupabaseClient,
  brokerId: string | null | undefined,
): Promise<BrokerClient> {
  const resolvedId = brokerId ?? 'oanda_practice';
  const { data } = await supabase
    .from('bridge_brokers')
    .select('broker_id, broker_type, account_id, is_active')
    .eq('broker_id', resolvedId)
    .maybeSingle();

  if (data) {
    const client = createBrokerClient(
      data as {
        broker_id: string;
        broker_type: string;
        account_id: string | null;
        is_active: boolean;
      },
      PDL_WINDOW_ENGINE_ID,
    );
    if (client) return client;
  }

  return createOandaBroker({
    brokerId: 'oanda_practice',
    brokerType: 'oanda',
    accountId:
      process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID,
  });
}
