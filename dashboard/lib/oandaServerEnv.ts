import {
  OMEGA_LANE_A_BROKER_ID,
  type OverrideBrokerId,
  resolveOverrideBrokerId,
} from '@/lib/overrideBrokerScope';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

export interface OandaServerEnv {
  baseUrl: string;
  accountId: string;
  apiToken: string;
  brokerId: OverrideBrokerId;
}

function oandaBaseUrl(): string {
  const environment = process.env.OANDA_ENVIRONMENT ?? 'practice';
  return environment === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com';
}

function accountIdForBroker(brokerId: OverrideBrokerId): string {
  if (brokerId === OMEGA_LANE_B_BROKER_ID) {
    return process.env.OANDA_PHASE2_ACCOUNT_ID?.trim() ?? '';
  }
  return process.env.OANDA_ACCOUNT_ID?.trim() ?? '';
}

function accountEnvName(brokerId: OverrideBrokerId): string {
  return brokerId === OMEGA_LANE_B_BROKER_ID
    ? 'OANDA_PHASE2_ACCOUNT_ID'
    : 'OANDA_ACCOUNT_ID';
}

/** Lane A default — preserves existing Override / candle callers. */
export function readOandaServerEnv(): OandaServerEnv {
  return readOandaServerEnvForBroker(OMEGA_LANE_A_BROKER_ID);
}

export function readOandaServerEnvForBroker(brokerId: OverrideBrokerId): OandaServerEnv {
  return {
    baseUrl: oandaBaseUrl(),
    accountId: accountIdForBroker(brokerId),
    apiToken: process.env.OANDA_API_TOKEN?.trim() ?? '',
    brokerId,
  };
}

export function assertOandaServerEnv(): OandaServerEnv {
  return assertOandaServerEnvForBroker(OMEGA_LANE_A_BROKER_ID);
}

export function assertOandaServerEnvForBroker(
  brokerIdInput: string,
): OandaServerEnv {
  const brokerId = resolveOverrideBrokerId(brokerIdInput);
  const env = readOandaServerEnvForBroker(brokerId);
  const missing: string[] = [];
  if (!env.apiToken) missing.push('OANDA_API_TOKEN');
  if (!env.accountId) missing.push(accountEnvName(brokerId));
  if (missing.length > 0) {
    throw new Error(
      `Override OANDA env missing on dashboard host (${brokerId}): ${missing.join(', ')}. ` +
        'Set them in Vercel project env and redeploy.',
    );
  }
  return env;
}
