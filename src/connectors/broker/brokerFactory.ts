/**
 * Instantiate BrokerClient from bridge_brokers row + engine context.
 */

import { createMt5Broker } from './mt5Broker.js';
import { createOandaBroker } from './oandaBroker.js';
import type { BrokerClient, BrokerClientConfig, BrokerType } from './types.js';
import { OMEGA_AO_VT_BROKER_ID } from '../../core/alphaOmega/alphaOmegaConstants.js';

export interface BridgeBrokerRow {
  broker_id: string;
  broker_type: string;
  account_id: string | null;
  is_active: boolean;
}

const MT5_BROKER_ACCOUNT_ENV: Record<string, string> = {
  vtmarkets_omega_demo: 'METAAPI_OMEGA_ACCOUNT_ID',
  vtmarkets_fade_demo: 'METAAPI_FADE_ACCOUNT_ID',
  [OMEGA_AO_VT_BROKER_ID]: 'METAAPI_AO_ACCOUNT_ID',
};

const ENGINE_MAGIC: Record<string, number> = {
  omega: 88001,
  audusd_fade: 88002,
  pdl_window: 88003,
};

/** Distinct magic for AO-on-MT5 vs classic omega RAW VT (88001). */
const AO_VT_MAGIC = 88004;

function resolveOandaAccountId(engineId: string, brokerId?: string): string | undefined {
  if (brokerId === 'oanda_phase2_demo') {
    return process.env.OANDA_PHASE2_ACCOUNT_ID?.trim() || undefined;
  }
  // Share Fade's dedicated OANDA account — Fade behavior unchanged.
  if (engineId === 'audusd_fade' || engineId === 'pdl_window') {
    return process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID;
  }
  return process.env.OANDA_ACCOUNT_ID;
}

function isEnvAccountSentinel(accountId: string | null | undefined): boolean {
  return !!accountId && accountId.startsWith('ENV:');
}

/**
 * Prefer env override when set; else a real MetaApi UUID from bridge_brokers.account_id.
 * Never treats ENV:… sentinel strings as live account ids.
 */
export function resolveMt5AccountId(
  brokerId: string,
  dbAccountId: string | null | undefined,
): string | undefined {
  const envKey = MT5_BROKER_ACCOUNT_ENV[brokerId];
  if (envKey) {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv) return fromEnv;
  }
  if (dbAccountId && !isEnvAccountSentinel(dbAccountId)) {
    const trimmed = dbAccountId.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function resolveMagicNumber(engineId: string, brokerId: string): number {
  if (brokerId === OMEGA_AO_VT_BROKER_ID) return AO_VT_MAGIC;
  return ENGINE_MAGIC[engineId] ?? 88099;
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
    const accountId = resolveMt5AccountId(brokerRow.broker_id, brokerRow.account_id);
    if (!accountId) return null;
    const config: BrokerClientConfig = {
      brokerId: brokerRow.broker_id,
      brokerType: 'mt5',
      accountId,
      symbolSuffix: process.env.VT_SYMBOL_SUFFIX ?? '-STD',
      magicNumber: resolveMagicNumber(engineId, brokerRow.broker_id),
    };
    return createMt5Broker(config);
  }

  const config: BrokerClientConfig = {
    brokerId: brokerRow.broker_id,
    brokerType: 'oanda',
    accountId: resolveOandaAccountId(engineId, brokerRow.broker_id),
  };
  return createOandaBroker(config);
}
