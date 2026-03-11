/**
 * Every 30s: OANDA account summary, ping Supabase; update cache, bridge_brokers, bridge_health_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccountSummary, getPricing } from '../connectors/oanda.js';
import type { AccountSummary } from '../connectors/oanda.js';
import { logInfo } from '../utils/logger.js';
import { sendAlert } from './alerter.js';

let cachedAccount: AccountSummary | null = null;
let consecutiveOandaFailures = 0;
let cachedConversionRates: Record<string, number> = {};

export function getCachedAccountSummary(): AccountSummary | null {
  return cachedAccount;
}

export function getCachedConversionRates(): Record<string, number> {
  return cachedConversionRates;
}

export async function runHeartbeat(supabase: SupabaseClient): Promise<void> {
  let oandaOk = false;
  let supabaseOk = false;
  try {
    const summary = await getAccountSummary();
    cachedAccount = summary;
    consecutiveOandaFailures = 0;
    oandaOk = true;
    const rateQuotes = await getPricing('USD_JPY,USD_CAD,USD_CHF,GBP_USD,AUD_USD');
    const rates: Record<string, number> = {};
    for (const q of rateQuotes) {
      rates[q.instrument] = (parseFloat(q.bid) + parseFloat(q.ask)) / 2;
    }
    cachedConversionRates = rates;
    await supabase.from('bridge_brokers').update({
      connection_status: 'connected',
      last_heartbeat_at: new Date().toISOString(),
    }).eq('broker_id', 'oanda_practice');
  } catch {
    consecutiveOandaFailures += 1;
    if (consecutiveOandaFailures >= 3) await sendAlert(supabase, 'health', 'OANDA connection failed 3 times');
    await supabase.from('bridge_brokers').update({ connection_status: 'error' }).eq('broker_id', 'oanda_practice');
  }
  try {
    const { data: configRow } = await supabase
      .from('bridge_config')
      .select('config_key, config_value')
      .eq('config_key', 'bridge_active')
      .maybeSingle();
    supabaseOk = true;
    const bridgeActive = configRow?.config_value === true || configRow?.config_value === 'true';
    if (!bridgeActive) {
      logInfo('bridge_active=false from dashboard; exiting.');
      process.exit(0);
    }
  } catch {
    supabaseOk = false;
  }
  await supabase.from('bridge_health_log').insert({
    checked_at: new Date().toISOString(),
    oanda_ok: oandaOk,
    supabase_ok: supabaseOk,
    broker_connection_status: oandaOk ? 'connected' : 'error',
  });
}
