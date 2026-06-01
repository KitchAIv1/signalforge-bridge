/**
 * SignalForge Bridge — entry point.
 * Startup: load config → exit if !bridge_active → load engines → OANDA check → reconciliation → dedup pre-pop → init circuit breaker → heartbeat + trade monitor → Realtime subscribe.
 */

import 'dotenv/config';
import cron from 'node-cron';
import { getSupabaseClient, subscribeToSignalInserts, getSignalTableName } from './connectors/supabase.js';
import { loadBridgeConfig, loadActiveEngines, reloadEngineById } from './config/bridgeConfig.js';
import { getAccountSummary } from './connectors/oanda.js';
import { initCircuitBreaker, updatePeakEquity } from './core/circuitBreaker.js';
import { processSignal } from './core/signalRouter.js';
import { runStartupReconciliation } from './startupReconciliation.js';
import { runHeartbeat, getCachedAccountSummary } from './monitoring/heartbeat.js';
import { runTradeMonitor } from './monitoring/tradeMonitor.js';
import { logInfo, logWarn } from './utils/logger.js';
import { runRegimeDetection } from './services/RegimeDetectorService.js';
import {
  runAmdDetection,
  runAmdOutcomeDetection,
} from './services/AmdDetectorService.js';
import { runAsianDirectionSet, runAsianSessionClose } from './services/AsianDirectionService.js';
import { fetchTodayAsianCandles } from './services/asianM5/asianM5CandleFetch.js';
import { fetchTodayDistributionCandles } from './services/distributionM5/distributionM5CandleFetch.js';
import { AmdDistributionEngine } from './services/AmdDistributionEngine.js';
import { runAmdTrailMonitor } from './monitoring/amdTrailingStopMonitor.js';
import {
  hardClose as scalperHardClose,
  initializeDayState as scalperInitDay,
  runMonitors as scalperRunMonitors,
} from './services/scalper/ScalperEngine.js';

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
  let summary: Awaited<ReturnType<typeof getAccountSummary>>;
  let startupAttempt = 0;
  const STARTUP_RETRY_DELAY_MS = 15000;

  while (true) {
    try {
      summary = await getAccountSummary();
      if (startupAttempt > 0) {
        logInfo(`[Startup] OANDA connected after ${startupAttempt} attempt(s)`);
      }
      break;
    } catch (err) {
      startupAttempt++;
      if (startupAttempt % 4 === 1) {
        logWarn(`[Startup] OANDA unreachable (attempt ${startupAttempt}) — retrying in ${STARTUP_RETRY_DELAY_MS / 1000}s`, { error: String(err) });
      }
      await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
    }
  }
  initCircuitBreaker(config.killSwitch, summary.equity);
  updatePeakEquity(summary.equity);
  await runStartupReconciliation(supabase);
  const tableName = getSignalTableName();
  logInfo('Bridge starting', { table: tableName, engines: engines.map((e) => e.engine_id), mode: process.env.OANDA_ENVIRONMENT ?? 'practice' });

  const heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;
  setInterval(() => runHeartbeat(supabase), heartbeatIntervalMs);
  setInterval(() => runTradeMonitor(supabase, engines), config.tradeMonitorIntervalMs ?? 30000);
  await runHeartbeat(supabase);

  // Regime detector — runs 5 minutes after every H4 candle close (6x per day)
  // H4 candles close at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
  cron.schedule('5 0,4,8,12,16,20 * * *', async () => {
    try {
      await runRegimeDetection();
    } catch (regimeError) {
      console.error('[RegimeDetector] Scheduled run error:', regimeError);
    }
  }, { timezone: 'UTC' });

  // Run once on startup so regime_state is populated immediately
  runRegimeDetection().catch(startupError => {
    console.error('[RegimeDetector] Startup run error:', startupError);
  });

  cron.schedule('31 10 * * 1-5', async () => {
    try {
      await runAmdDetection();
    } catch (amdError) {
      console.error('[AmdDetector] Scheduled run error:', amdError);
    }
  }, { timezone: 'UTC' });

  cron.schedule('30 16 * * *', async () => {
    try {
      await runAmdOutcomeDetection();
    } catch (outcomeErr) {
      console.error(
        '[AmdOutcome] Scheduled run error:',
        outcomeErr,
      );
    }
  }, { timezone: 'UTC' });

  cron.schedule('10 21 * * *', async () => {
    try {
      console.log('[AsianDirection] 21:10 UTC cron fired — running direction set');
      await runAsianDirectionSet();
    } catch (asianDirSetErr) {
      console.error('[AsianDirection] Scheduled direction set error:', asianDirSetErr);
    }
  }, { timezone: 'UTC' });

  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[AsianDirection] 08:00 UTC cron fired — running Asian session close');
      await runAsianSessionClose();
    } catch (asianCloseErr) {
      console.error('[AsianDirection] Scheduled session close error:', asianCloseErr);
    }
  }, { timezone: 'UTC' });

  // 08:05 UTC — Asian session closed, fetch today's M5 candles
  cron.schedule('5 8 * * 1-5', async () => {
    try {
      await fetchTodayAsianCandles();
    } catch (asianM5Err) {
      console.error('[AsianM5] Daily fetch error:', asianM5Err);
    }
  }, { timezone: 'UTC' });

  // 16:05 UTC — distribution window closed, fetch today's M5 candles
  cron.schedule('5 16 * * 1-5', async () => {
    try {
      await fetchTodayDistributionCandles();
    } catch (distributionM5Err) {
      console.error('[DistributionM5] Daily fetch error:', distributionM5Err);
    }
  }, { timezone: 'UTC' });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await AmdDistributionEngine.checkAndExecute();
    } catch (amdDistError) {
      console.error('[AmdDistribution] Scheduled run error:', amdDistError);
    }
  }, { timezone: 'UTC' });

  setInterval(() => {
    void runAmdTrailMonitor().catch((amdTrailErr) => {
      console.error('[AmdTrail] Monitor error:', amdTrailErr);
    });
  }, 30000);

  // Scalper engine — price-ratchet pullback on AUD_USD AGREE days.
  // Controlled by SCALPER_ENABLED env var. Set to 'true' on Railway to activate.
  if (process.env.SCALPER_ENABLED === 'true') {
    // AMD detector runs at 10:31 UTC (cron '31 10 * * *'); first viable AMD state check is 10:32.
    // Three crons provide retries at 10:32, 10:37, 10:42; initializeDayState() is DB-idempotent.
    cron.schedule('32 10 * * 1-5', () => {
      void scalperInitDay().catch((e) => console.error('[Scalper] Init 10:32 error:', e));
    }, { timezone: 'UTC' });
    cron.schedule('37 10 * * 1-5', () => {
      void scalperInitDay().catch((e) => console.error('[Scalper] Init 10:37 retry:', e));
    }, { timezone: 'UTC' });
    cron.schedule('42 10 * * 1-5', () => {
      void scalperInitDay().catch((e) => console.error('[Scalper] Init 10:42 retry:', e));
    }, { timezone: 'UTC' });
    setInterval(() => {
      void scalperRunMonitors().catch((e) => console.error('[Scalper] Monitor error:', e));
    }, 30000);
    cron.schedule('0 16 * * 1-5', () => {
      void scalperHardClose().catch((e) => console.error('[Scalper] HardClose error:', e));
    }, { timezone: 'UTC' });
    logInfo('[Scalper] Engine registered — SCALPER_ENABLED=true');
  }

  // Skip AMD startup run if before 10:31 UTC — H1 fetch uses toISO=10:30Z, OANDA rejects future timestamps
  // The 10:31 UTC cron handles the daily run; startup call only needed if bridge restarts mid-day after 10:31
  const _amdNow = new Date();
  const _amdUtcHour = _amdNow.getUTCHours();
  const _amdUtcMin = _amdNow.getUTCMinutes();
  const _amdWindowOpen = _amdUtcHour > 10 || (_amdUtcHour === 10 && _amdUtcMin >= 31);
  if (_amdWindowOpen) {
    runAmdDetection().catch(startupAmdErr => {
      console.error('[AmdDetector] Startup run error:', startupAmdErr);
    });
  } else {
    logInfo('[AmdDetector] Startup before 10:31 UTC — skipping startup run, cron handles daily detection');
  }

  // Outcome detection startup — only after 16:30 UTC
  const _outcomeWindowOpen =
    _amdUtcHour > 16 ||
    (_amdUtcHour === 16 && _amdUtcMin >= 30);
  if (_outcomeWindowOpen) {
    runAmdOutcomeDetection().catch((outcomeStartErr) => {
      console.error(
        '[AmdOutcome] Startup run error:',
        outcomeStartErr,
      );
    });
  }

  // Asian direction set removed from startup — the 21:10 UTC cron is the sole trigger.
  // Startup runs were overwriting omega_direction_valid_until with NOW when no AMD state
  // existed for today (before 10:31 UTC), destroying active Asian session windows.

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

  const enginesRosterChannel = supabase
    .channel('bridge_engines_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bridge_engines' },
      async (change) => {
        logInfo(
          `[EngineRoster] change received | event: ${change.eventType} | new: ${JSON.stringify(change.new)} | old: ${JSON.stringify(change.old)}`
        );
        try {
          const engineId: string =
            (change.new as { engine_id?: string } | null)?.engine_id
            ?? (change.old as { engine_id?: string } | null)?.engine_id ?? '';

          if (!engineId) return;

          const updated = await reloadEngineById(supabase, engineId);
          const idx = engines.findIndex((e) => e.engine_id === engineId);

          if (!updated || !updated.is_active) {
            if (idx !== -1) {
              engines.splice(idx, 1);
              logInfo(`[EngineRoster] ${engineId} deactivated — removed from in-memory roster`);
            }
          } else if (idx !== -1) {
            engines[idx] = updated;
            logInfo(`[EngineRoster] ${engineId} updated in-memory roster`);
          } else {
            engines.push(updated);
            logInfo(`[EngineRoster] ${engineId} activated — added to in-memory roster`);
          }
        } catch (rosterErr) {
          logWarn('[EngineRoster] realtime sync error', { error: String(rosterErr) });
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        logInfo('[EngineRoster] bridge_engines realtime subscription active');
      } else {
        logWarn(
          `[EngineRoster] bridge_engines subscription status: ${status} | err: ${JSON.stringify(err)}`
        );
      }
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
  process.on('SIGINT', () => {
    void enginesRosterChannel.unsubscribe();
    channel.unsubscribe();
    logInfo('Bridge shutdown');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    void enginesRosterChannel.unsubscribe();
    channel.unsubscribe();
    logInfo('Bridge shutdown');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Bridge failed to start:', err);
  process.exit(1);
});
