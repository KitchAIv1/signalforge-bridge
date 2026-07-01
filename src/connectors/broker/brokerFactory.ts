/**
 * Instantiate BrokerClient from bridge_brokers row + engine context.
 */

import { createMt5Broker } from './mt5Broker.js';
import { createOandaBroker } from './oandaBroker.js';
import type { BrokerClient, BrokerClientConfig, BrokerType } from './types.js';

export interface BridgeBrokerRow {
  broker_id: string;
  broker_type: string;
  account_id: string | null;
  is_active: boolean;
}

const MT5_BROKER_ACCOUNT_ENV: Record<string, string> = {
  vtmarkets_omega_demo: 'METAAPI_OMEGA_ACCOUNT_ID',
  vtmarkets_fade_demo: 'METAAPI_FADE_ACCOUNT_ID',
};

const ENGINE_MAGIC: Record<string, number> = {
  omega: 88001,
  audusd_fade: 88002,
};

function resolveOandaAccountId(engineId: string): string | undefined {
  if (engineId === 'audusd_fade') {
    return process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID;
  }
  return process.env.OANDA_ACCOUNT_ID;
}

function resolveMt5AccountId(brokerId: string): string | undefined {
  const envKey = MT5_BROKER_ACCOUNT_ENV[brokerId];
  if (!envKey) return undefined;
  return process.env[envKey]?.trim() || undefined;
}

export function isMt5GloballyEnabled(): boolean {
  return process.env.MT5_ENABLED === 'true';
}

export function createBrokerClient(
  brokerRow: BridgeBrokerRow,
  engineId: string,
): BrokerClient | null {
  const brokerType = brokerRow.broker_type as BrokerType;
  if (brokerType === 'mt5' && !isMt5GloballyEnabled()) return null;

  if (brokerType === 'mt5') {
    const accountId = resolveMt5AccountId(brokerRow.broker_id);
    if (!accountId) return null;
    const config: BrokerClientConfig = {
      brokerId: brokerRow.broker_id,
      brokerType: 'mt5',
      accountId,
      symbolSuffix: process.env.VT_SYMBOL_SUFFIX ?? '-STD',
      magicNumber: ENGINE_MAGIC[engineId] ?? 88099,
    };
    return createMt5Broker(config);
  }

  const config: BrokerClientConfig = {
    brokerId: brokerRow.broker_id,
    brokerType: 'oanda',
    accountId: resolveOandaAccountId(engineId),
  };
  return createOandaBroker(config);
}
