/**
 * Persist AO VT bind/disconnect on existing bridge_brokers + bridge_links rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OMEGA_AO_VT_BROKER_ID } from '@/lib/omegaLaneBConstants';
import { normalizeMt5SymbolSuffix } from '@/lib/mt5/mt5SymbolSuffix';

export interface AoVtBrokerSnapshot {
  brokerId: string;
  displayName: string;
  accountId: string | null;
  isActive: boolean;
  connectionStatus: string | null;
  lastHeartbeatAt: string | null;
  linkActive: boolean;
  symbolSuffix: string | null;
}

function mapBrokerSnapshot(
  broker: Record<string, unknown>,
  linkActive: boolean,
): AoVtBrokerSnapshot {
  return {
    brokerId: String(broker.broker_id),
    displayName: String(broker.display_name ?? broker.broker_id),
    accountId: (broker.account_id as string | null) ?? null,
    isActive: Boolean(broker.is_active),
    connectionStatus: (broker.connection_status as string | null) ?? null,
    lastHeartbeatAt: (broker.last_heartbeat_at as string | null) ?? null,
    linkActive,
    symbolSuffix: (broker.symbol_suffix as string | null) ?? null,
  };
}

const BROKER_SELECT =
  'broker_id, display_name, account_id, is_active, connection_status, last_heartbeat_at, symbol_suffix';

export async function loadAoVtBrokerSnapshot(
  supabase: SupabaseClient,
): Promise<AoVtBrokerSnapshot | null> {
  const { data: broker, error } = await supabase
    .from('bridge_brokers')
    .select(BROKER_SELECT)
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID)
    .maybeSingle();
  if (error || !broker) return null;

  const { data: link } = await supabase
    .from('bridge_links')
    .select('is_active')
    .eq('engine_id', 'omega')
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID)
    .maybeSingle();

  return mapBrokerSnapshot(broker as Record<string, unknown>, Boolean(link?.is_active));
}

export async function persistAoVtBindSuccess(
  supabase: SupabaseClient,
  metaApiAccountId: string,
  symbolSuffix: string,
): Promise<void> {
  const normalized = normalizeMt5SymbolSuffix(symbolSuffix);
  if (!normalized) throw new Error('Invalid symbol suffix — use -STD, -VIP, or -ECN');

  const now = new Date().toISOString();
  const { error: brokerError } = await supabase
    .from('bridge_brokers')
    .update({
      account_id: metaApiAccountId,
      symbol_suffix: normalized,
      is_active: true,
      connection_status: 'connected',
      last_heartbeat_at: now,
      updated_at: now,
    })
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (brokerError) throw new Error(brokerError.message);

  const { error: linkError } = await supabase
    .from('bridge_links')
    .update({ is_active: true, updated_at: now })
    .eq('engine_id', 'omega')
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (linkError) throw new Error(linkError.message);
}

export async function persistAoVtSymbolSuffix(
  supabase: SupabaseClient,
  symbolSuffix: string,
): Promise<void> {
  const normalized = normalizeMt5SymbolSuffix(symbolSuffix);
  if (!normalized) throw new Error('Invalid symbol suffix — use -STD, -VIP, or -ECN');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('bridge_brokers')
    .update({ symbol_suffix: normalized, updated_at: now })
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (error) throw new Error(error.message);
}

export async function persistAoVtProbeStatus(
  supabase: SupabaseClient,
  connected: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string> = {
    connection_status: connected ? 'connected' : 'disconnected',
    updated_at: now,
  };
  if (connected) patch.last_heartbeat_at = now;
  const { error } = await supabase
    .from('bridge_brokers')
    .update(patch)
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (error) throw new Error(error.message);
}

export async function persistAoVtDisconnect(supabase: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  const { error: linkError } = await supabase
    .from('bridge_links')
    .update({ is_active: false, updated_at: now })
    .eq('engine_id', 'omega')
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (linkError) throw new Error(linkError.message);

  const { error: brokerError } = await supabase
    .from('bridge_brokers')
    .update({
      is_active: false,
      connection_status: 'disconnected',
      updated_at: now,
    })
    .eq('broker_id', OMEGA_AO_VT_BROKER_ID);
  if (brokerError) throw new Error(brokerError.message);
}
