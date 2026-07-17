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
import {
  runConditionACheck,
  runConditionBCheck,
  runConditionBSlowCheck,
  runConditionCCheck,
} from './services/AsianSessionDetectionService.js';
import { fetchTodayAsianCandles } from './services/asianM5/asianM5CandleFetch.js';
import { fetchTodayDistributionCandles } from './services/distributionM5/distributionM5CandleFetch.js';
import { fetchTodayD1Candles } from './services/d1/fetchTodayD1Candle.js';
import { AmdDistributionEngine } from './services/AmdDistributionEngine.js';
import { runAmdTrailMonitor } from './monitoring/amdTrailingStopMonitor.js';
import { runAlphaOmegaHardStopMonitor } from './monitoring/alphaOmegaHardStopMonitor.js';
import {
  hardClose as scalperHardClose,
  initializeDayState as scalperInitDay,
  runMonitors as scalperRunMonitors,
} from './services/scalper/ScalperEngine.js';
import {
  hardClose as fadeHardClose,
  runMonitors as fadeRunMonitors,
} from './services/audusdFade/FadeEngine.js';
import { runPdlSweepDetection } from './services/pdlSweepDetector/pdlSweepDetectorService.js';
import { runPdlSweepOutcome } from './services/pdlSweepDetector/pdlSweepOutcomeService.js';
import { PdlWindowEngine } from './services/pdlWindow/PdlWindowEngine.js';
import { runShadowTrailExitResolver } from './services/shadowTrailExit/shadowTrailExitService.js';
import { runMt5StartupDiagnostics } from './services/broker/mt5StartupDiagnostics.js';
import { resolveAmdOandaAccountId } from './services/amd/resolveAmdOandaAccountId.js';
import { AMD_PIP_TRAIL_PIPS } from './services/amd/amdTrailConstants.js';

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
  if (process.env.AMD_DISTRIBUTION_ENABLED === 'true') {
    logInfo('[Startup] AMD OANDA account', { accountId: resolveAmdOandaAccountId() });
    logInfo('[Startup] AMD pip trail', { trailPips: AMD_PIP_TRAIL_PIPS });
  }
  const tableName = getSignalTableName();
  logInfo('Bridge starting', { table: tableName, engines: engines.map((e) => e.engine_id), mode: process.env.OANDA_ENVIRONMENT ?? 'practice' });

  try {
    await runMt5StartupDiagnostics(
      supabase,
      engines.map((engineRow) => engineRow.engine_id),
    );
  } catch (mt5StartupErr) {
    logWarn('[MT5] Startup diagnostics failed — bridge continues', { error: String(mt5StartupErr) });
  }

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

  // Run once on startup so regime_state is populated immediately (skip if ran within 30 min)
  (async () => {
    try {
      const { data: lastRegime } = await supabase
        .from('regime_state')
        .select('evaluated_at')
        .eq('pair', 'AUD_USD')
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastRanMs = lastRegime?.evaluated_at
        ? Date.now() - new Date(lastRegime.evaluated_at).getTime()
        : Infinity;

      if (lastRanMs > 30 * 60 * 1000) {
        await runRegimeDetection();
      } else {
        logInfo('[RegimeDetector] Startup skipped — ran within last 30 min');
      }
    } catch (err) {
      console.error('[RegimeDetector] Startup guard error:', err);
    }
  })();

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

  // 21:05 UTC Mon-Fri — OANDA D1 completes at 21:00 UTC; fetch before 21:10 direction-set cron
  cron.schedule('5 21 * * 1-5', async () => {
    try {
      await fetchTodayD1Candles();
    } catch (d1FetchErr) {
      console.error('[D1DailyFetch] Daily fetch error:', d1FetchErr);
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

  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('[AsianDetection] 01:00 UTC — Condition C check');
      await runConditionCCheck();
    } catch (err) {
      console.error('[AsianDetection] Condition C error:', err);
    }
  }, { timezone: 'UTC' });

  cron.schedule('5 3 * * *', async () => {
    try {
      console.log('[AsianDetection] 03:05 UTC — Condition B check');
      await runConditionBCheck();
    } catch (err) {
      console.error('[AsianDetection] Condition B error:', err);
    }
  }, { timezone: 'UTC' });

  cron.schedule('5 4 * * *', async () => {
    try {
      console.log('[AsianDetection] 04:05 UTC — Condition B_SLOW check');
      await runConditionBSlowCheck();
    } catch (err) {
      console.error('[AsianDetection] Condition B_SLOW error:', err);
    }
  }, { timezone: 'UTC' });

  cron.schedule('10 4 * * *', async () => {
    try {
      console.log('[AsianDetection] 04:10 UTC — Condition A check');
      await runConditionACheck();
    } catch (err) {
      console.error('[AsianDetection] Condition A error:', err);
    }
  }, { timezone: 'UTC' });

  logInfo(
    '[AsianDetection] Cron schedule: C@01:00 (12 bars), B@03:05 (37 bars), B_SLOW@04:05 (49 bars), A@04:10 (50 bars)',
  );

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

  // 12:10 UTC Mon-Fri — PDL sweep detection (+ optional live PDL Window entry)
  cron.schedule('10 12 * * 1-5', async () => {
    try {
      await runPdlSweepDetection();
    } catch (pdlSweepErr) {
      console.error('[PdlSweep] Detection cron error:', pdlSweepErr);
    }
    try {
      await PdlWindowEngine.runEntryOnce();
    } catch (pdlWindowEntryErr) {
      console.error('[PdlWindow] Entry cron error:', pdlWindowEntryErr);
    }
  }, { timezone: 'UTC' });
  logInfo('[cron] registered 10 12 * * 1-5 PDL sweep detection (+ PdlWindow entry if enabled)');

  // 13:05 UTC Mon-Fri — PDL sweep outcome evaluation
  cron.schedule('5 13 * * 1-5', async () => {
    try {
      await runPdlSweepOutcome();
    } catch (pdlOutcomeErr) {
      console.error('[PdlSweep] Outcome cron error:', pdlOutcomeErr);
    }
  }, { timezone: 'UTC' });
  logInfo('[cron] registered 5 13 * * 1-5 PDL sweep outcome');

  cron.schedule('*/5 * * * *', async () => {
    try {
      await AmdDistributionEngine.checkAndExecute();
    } catch (amdDistError) {
      console.error('[AmdDistribution] Scheduled run error:', amdDistError);
    }
  }, { timezone: 'UTC' });

  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', async () => {
    try {
      await runShadowTrailExitResolver(supabase);
    } catch (shadowTrailErr) {
      console.error('[ShadowTrail] Resolver error:', shadowTrailErr);
    }
  }, { timezone: 'UTC' });
  logInfo('[cron] registered shadow Trail v1 resolver every 5 min (offset +2m)');

  setInterval(() => {
    void runAmdTrailMonitor().catch((amdTrailErr) => {
      console.error('[AmdTrail] Monitor error:', amdTrailErr);
    });
  }, 30000);

  // ALPHAOMEGA — Lane B (oanda_phase2_demo) hard-stop check, isolated from Lane A.
  // Opposing-fire-count + backstop-crack exits are fire-driven (handled inline in
  // omegaMultiBrokerExecution.ts); this interval covers the price-based hard stop,
  // which needs continuous checking since adverse moves can happen between fires.
  setInterval(() => {
    void runAlphaOmegaHardStopMonitor().catch((alphaOmegaErr) => {
      console.error('[AlphaOmegaHardStop] Monitor error:', alphaOmegaErr);
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

  // AUDUSD Fade engine — EURUSD-gated SMA50 mean-reversion fade on AUD_USD.
  // Self-contained paper engine (OANDA practice); mirrors closed trades into Activity.
  // Controlled by AUDUSD_FADE_ENABLED env var. Set to 'true' on Railway to activate.
  if (process.env.AUDUSD_FADE_ENABLED === 'true') {
    setInterval(() => {
      void fadeRunMonitors().catch((e) => console.error('[AudFade] Monitor error:', e));
    }, 30000);
    cron.schedule('0 22 * * 1-5', () => {
      void fadeHardClose().catch((e) => console.error('[AudFade] HardClose error:', e));
    }, { timezone: 'UTC' });
    const fadeAccount = process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID;
    logInfo(
      `[AudFade] Engine registered — AUDUSD_FADE_ENABLED=true | OANDA account=${
        fadeAccount ?? 'SHARED (AUDUSD_FADE_OANDA_ACCOUNT_ID unset — risks cross-engine netting)'
      }`,
    );
  }

  // PDL Window — always LONG 12:00–15:00 unless all-3-false; SL 20p.
  // Shares Fade OANDA/MT5 accounts. OANDA blocks if Fade open; MT5 does not.
  // Controlled by PDL_WINDOW_ENABLED. Separate interval from Fade (do not nest).
  if (process.env.PDL_WINDOW_ENABLED === 'true') {
    setInterval(() => {
      void PdlWindowEngine.runMonitors().catch((e) =>
        console.error('[PdlWindow] Monitor error:', e),
      );
    }, 30000);
    cron.schedule('0 15 * * 1-5', () => {
      void PdlWindowEngine.hardFlatten1500().catch((e) =>
        console.error('[PdlWindow] HardFlatten error:', e),
      );
    }, { timezone: 'UTC' });
    const pdlAccount = process.env.AUDUSD_FADE_OANDA_ACCOUNT_ID;
    logInfo(
      `[PdlWindow] Engine registered — PDL_WINDOW_ENABLED=true | OANDA=${
        pdlAccount ?? 'SHARED'
      } | magic=88003 | OANDA fade-open guard ON | MT5 fade-open guard OFF`,
    );
  }

  // Skip AMD startup run if before 10:31 UTC — H1 fetch uses toISO=10:30Z, OANDA rejects future timestamps
  // The 10:31 UTC cron handles the daily run; startup call only needed if bridge restarts mid-day after 10:31
  const _amdNow = new Date();
  const _amdUtcHour = _amdNow.getUTCHours();
  const _amdUtcMin = _amdNow.getUTCMinutes();
  const _amdWindowOpen = _amdUtcHour > 10 || (_amdUtcHour === 10 && _amdUtcMin >= 31);
  if (_amdWindowOpen) {
    // V10 fix: if today's decision snapshot already exists,
    // detection already ran at 10:31 — skip restart rerun
    try {
      const _v10Today = new Date().toISOString().slice(0, 10);
      const { data: _v10Row } = await supabase
        .from('amd_state')
        .select('decision_auto_direction')
        .eq('pair', 'AUD_USD')
        .eq('trade_date', _v10Today)
        .maybeSingle();

      if (_v10Row?.decision_auto_direction != null) {
        console.log(
          '[AmdDetector] Startup: decision snapshot already exists for ' +
            _v10Today +
            ' (' +
            _v10Row.decision_auto_direction +
            ') — skipping detection rerun to protect 10:31 decision',
        );
      } else {
        runAmdDetection().catch((startupAmdErr) => {
          console.error('[AmdDetector] Startup run error:', startupAmdErr);
        });
      }
    } catch (_v10Err) {
      console.warn(
        '[AmdDetector] V10 snapshot check failed — running detection as fallback:',
        _v10Err,
      );
      runAmdDetection().catch((startupAmdErr) => {
        console.error('[AmdDetector] Startup run error:', startupAmdErr);
      });
    }
  } else {
    logInfo('[AmdDetector] Startup before 10:31 UTC — skipping startup run, cron handles daily detection');
  }

  // Outcome detection startup — only after 16:30 UTC
  const _outcomeWindowOpen =
    _amdUtcHour > 16 ||
    (_amdUtcHour === 16 && _amdUtcMin >= 30);
  if (_outcomeWindowOpen) {
    (async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: existingOutcome } = await supabase
          .from('amd_state')
          .select('outcome_evaluated_at')
          .eq('trade_date', todayStr)
          .eq('pair', 'AUD_USD')
          .maybeSingle();

        if (existingOutcome?.outcome_evaluated_at) {
          logInfo('[AmdOutcome] Startup skipped — outcome already written today');
        } else {
          await runAmdOutcomeDetection();
        }
      } catch (err) {
        console.error('[AmdOutcome] Startup guard error:', err);
      }
    })();
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
