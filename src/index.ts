/**
 * SignalForge Bridge — entry point.
 * Startup: load config → exit if !bridge_active → load engines → OANDA check → reconciliation → dedup pre-pop → init circuit breaker → heartbeat + trade monitor → Realtime subscribe.
 */

import 'dotenv/config';
import { getSupabaseClient, subscribeToSignalInserts, getSignalTableName } from './connectors/supabase.js';
import { loadBridgeConfig, loadActiveEngines } from './config/bridgeConfig.js';
import { getAccountSummary } from './connectors/oanda.js';
import { initCircuitBreaker, updatePeakEquity } from './core/circuitBreaker.js';
import { processSignal } from './core/signalRouter.js';
import { runStartupReconciliation } from './startupReconciliation.js';
import { runHeartbeat, getCachedAccountSummary } from './monitoring/heartbeat.js';
import { runTradeMonitor } from './monitoring/tradeMonitor.js';
import { logInfo, logWarn } from './utils/logger.js';

let ready = false;
const signalQueue: Array<Record<string, unknown>> = [];

async function getOpenTradesFromLog(): Promise<Array<{ pair: string; units: number }>> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.from('bridge_trade_log').select('pair, units').eq('status', 'open').not('units', 'is', null);
  return (data ?? []).map((r: { pair: string; units: number }) => ({ pair: r.pair, units: r.units ?? 0 }));
}

async function main(): Promise<void> {
  const supabase = getSupabaseClient();
  const config = await loadBridgeConfig(supabase);
  if (!config.bridgeActive) {
    logWarn('Bridge inactive (bridge_active=false). Exiting.');
    process.exit(0);
  }
  const engines = await loadActiveEngines(supabase);
  if (engines.length === 0) {
    logInfo('No active engines; bridge waiting for signals.');
  }
  const summary = await getAccountSummary();
  initCircuitBreaker(config.killSwitch, summary.equity);
  updatePeakEquity(summary.equity);
  await runStartupReconciliation(supabase);
  const tableName = getSignalTableName();
  logInfo('Bridge starting', { table: tableName, engines: engines.map((e) => e.engine_id), mode: process.env.OANDA_ENVIRONMENT ?? 'practice' });

  const heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;
  setInterval(() => runHeartbeat(supabase), heartbeatIntervalMs);
  setInterval(() => runTradeMonitor(supabase, engines), config.tradeMonitorIntervalMs ?? 30000);
  await runHeartbeat(supabase);

  const channel = subscribeToSignalInserts(supabase, (payload) => {
    if (!ready) {
      signalQueue.push(payload as Record<string, unknown>);
      return;
    }
    processSignal(payload, new Date(), {
      supabase,
      config,
      engines,
      getCachedAccount: getCachedAccountSummary,
      getOpenTradesFromLog,
    }).catch((err) => logWarn('processSignal error', { error: String(err) }));
  });
  ready = true;
  while (signalQueue.length > 0) {
    const payload = signalQueue.shift() as Record<string, unknown>;
    await processSignal(payload as Parameters<typeof processSignal>[0], new Date(), {
      supabase,
      config,
      engines,
      getCachedAccount: getCachedAccountSummary,
      getOpenTradesFromLog,
    }).catch((err) => logWarn('processSignal error', { error: String(err) }));
  }

  async function resetTradesToday(): Promise<void> {
    await supabase
      .from('bridge_engines')
      .update({ trades_today: 0, updated_at: new Date().toISOString() })
      .neq('engine_id', '');
    logInfo('trades_today reset to 0 for all engines');
  }

  function scheduleMidnightReset(): void {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ms = next.getTime() - now.getTime();
    logInfo(`Next trades_today reset in ${Math.round(ms / 60000)} minutes`);
    setTimeout(() => {
      void resetTradesToday();
      scheduleMidnightReset();
    }, ms);
  }

  async function resetIfNeeded(): Promise<void> {
    const { data } = await supabase
      .from('bridge_engines')
      .select('trades_today, updated_at')
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const row = data as { updated_at?: string };
    const lastUpdate = row.updated_at ? new Date(row.updated_at) : null;
    const todayUTC = new Date().toISOString().slice(0, 10);
    const lastUpdateDate = lastUpdate?.toISOString().slice(0, 10);

    if (lastUpdateDate !== todayUTC) {
      logInfo('Startup: trades_today out of date — resetting');
      await resetTradesToday();
    }
  }

  await resetIfNeeded();
  scheduleMidnightReset();
  process.on('SIGINT', () => { channel.unsubscribe(); logInfo('Bridge shutdown'); process.exit(0); });
  process.on('SIGTERM', () => { channel.unsubscribe(); logInfo('Bridge shutdown'); process.exit(0); });
}

main().catch((err) => {
  console.error('Bridge failed to start:', err);
  process.exit(1);
});
