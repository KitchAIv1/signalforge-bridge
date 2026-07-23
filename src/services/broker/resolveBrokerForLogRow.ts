/**
 * Resolve BrokerClient for a bridge_trade_log open row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrokerClient } from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { createOandaBroker } from '../../connectors/broker/oandaBroker.js';
import { logWarn } from '../../utils/logger.js';

export async function resolveBrokerForLogRow(
  supabase: SupabaseClient,
  brokerId: string | null | undefined,
  engineId: string,
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
      engineId,
    );
    if (client) return client;

    // Fail closed for MT5 — never attempt OANDA close with an MT5 ticket id.
    if (data.broker_type === 'mt5') {
      const message =
        `MT5 broker ${resolvedId} unavailable (MT5_ENABLED / account UUID / METAAPI_TOKEN)`;
      logWarn('[resolveBrokerForLogRow] ' + message, { brokerId: resolvedId, engineId });
      throw new Error(message);
    }
  }

  if (resolvedId.startsWith('vtmarkets_')) {
    const message = `MT5 broker ${resolvedId} row missing or inactive`;
    logWarn('[resolveBrokerForLogRow] ' + message, { brokerId: resolvedId, engineId });
    throw new Error(message);
  }

  return createOandaBroker({
    brokerId: 'oanda_practice',
    brokerType: 'oanda',
    accountId: process.env.OANDA_ACCOUNT_ID,
  });
}
