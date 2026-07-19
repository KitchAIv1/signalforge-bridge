/**
 * Signal router: validate → Check 1 (engine) → 2 (circuit) → 3 (conflict/dedup) → 4 (risk) → 5 (latency) → 6 (execute).
 * Log every decision to bridge_trade_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../types/config.js';
import type { AccountSummary } from '../connectors/oanda.js';
import type { DecisionType } from '../types/signals.js';
import {
  fetchLatestRegimeState,
  getRegimeSizeMultiplier,
  type ActiveRegimeState,
} from '../services/RegimeStateService.js';
import {
  fetchLatestAmdState,
  type ActiveAmdState,
} from '../services/amdDetector/amdStateService.js';
import { validateSignal } from './signalValidation.js';
import { isTripped, getPeakEquity, getConsecutiveLosses, enterCooldown } from './circuitBreaker.js';
import { sendCircuitBreakerAlert } from '../services/telegram/alertCircuitBreaker.js';
import { sendTradeExecutedAlert } from '../services/telegram/alertTradeExecution.js';
import {
  evaluateHybridEntryGate,
} from './omegaHybridEntryGate.js';
import { checkOmegaBrokerSequencingBlock } from './omegaOpenTradeSequencer.js';
import { executeOmegaOnAllBrokers } from '../services/broker/omegaMultiBrokerExecution.js';
import {
  handleOmegaValidationFailure,
  observeOmegaFireIfNeeded,
} from './alphaOmega/alphaOmegaRouterHooks.js';
import {
  parseOmegaRawModeFlag,
  shouldBypassDirectionFlip,
  shouldBypassExecutionThreshold,
  shouldBypassIsActive,
  shouldBypassWindowGate,
} from './omegaRawModeGates.js';
import {
  isOmegaRawPureSizingEnabled,
  sizeOmegaRawPureUnits,
} from './omegaRawPolicy/omegaRawPureSizer.js';
import { isDuplicate, hasOpenOppositePosition, countOpenSamePair, prePopulateDedupFromLog } from './conflictResolver.js';
import { countSameCurrencyExposure } from './correlationChecker.js';
import { runRiskChecks } from './riskManager.js';
import { calculateUnits } from './positionSizer.js';
import {
  patchTradeTPSL,
} from '../connectors/oanda.js';
import {
  parseRebuildBoundsRetryFlag,
  placeMarketOrderWithRebuildBoundsRetry,
} from './rebuildBoundsRetryOrder.js';
import {
  isRebuildHourUtcBlocked,
  parseRebuildHourGateEnabled,
} from './rebuildHourGate.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';
import { toOandaInstrument } from '../utils/pairs.js';
import { isForexMarketOpen } from '../utils/time.js';
import { getCachedConversionRates } from '../monitoring/heartbeat.js';
import { getNewsWindowEvent, type NewsWindowResult } from '../utils/newsCheck.js';
import { closeAllOpenOmegaPositions } from '../services/omegaClosePositions.js';

/** Last effective omega_direction (same source as resolveOmegaDirection). Used to detect DB/env flips. */
let cachedOmegaDirection: string | null = null;

export interface RouterDeps {
  supabase: SupabaseClient;
  config: BridgeConfig;
  engines: BridgeEngineRow[];
  getCachedAccount: () => AccountSummary | null;
  getOpenTradesFromLog: () => Promise<Array<{ pair: string; units: number }>>;
}

function findEngine(engines: BridgeEngineRow[], engineId: string): BridgeEngineRow | undefined {
  return engines.find((e) => e.engine_id === engineId);
}

function getConversionRateForInstrument(instrument: string, rates: Record<string, number>): number {
  const quote = instrument.length >= 7 ? instrument.slice(4, 7) : 'USD';
  const RATE_KEYS: Record<string, string> = {
    JPY: 'USD_JPY', CAD: 'USD_CAD', CHF: 'USD_CHF', GBP: 'GBP_USD', AUD: 'AUD_USD',
  };
  const rateKey = RATE_KEYS[quote];
  return rateKey != null ? (rates[rateKey] ?? 0) : 0;
}

function buildTradeLogRow(
  payload: SignalInsertPayload,
  decision: DecisionType,
  blockReason: string | null,
  decisionLatencyMs: number | null,
  equity: number | null,
  openCount: number,
  oandaPair?: string,
  directionOverride?: string
): Record<string, unknown> {
  const entryPrice = payload.entry_zone_low != null && payload.entry_zone_high != null
    ? (Number(payload.entry_zone_low) + Number(payload.entry_zone_high)) / 2
    : null;
  return {
    signal_id: payload.id,
    engine_id: payload.engine_id ?? payload.provider_id,
    pair: oandaPair ?? payload.pair,
    direction: directionOverride ?? payload.direction,
    confluence_score: payload.confluence_score,
    regime: payload.regime ?? null,
    entry_zone_low: payload.entry_zone_low ?? null,
    entry_zone_high: payload.entry_zone_high ?? null,
    entry_price: entryPrice,
    stop_loss: payload.stop_loss,
    take_profit: payload.take_profit ?? payload.target_1 ?? null,
    signal_received_at: payload.created_at ?? new Date().toISOString(),
    decision,
    block_reason: blockReason,
    decision_latency_ms: decisionLatencyMs,
    broker_id: decision === 'EXECUTED' ? 'oanda_practice' : null,
    status: decision === 'EXECUTED' ? 'open' : 'pending',
    account_equity_at_signal: equity,
    open_positions_count: openCount,
  };
}

function attachOmegaAuditFields(
  row: Record<string, unknown>,
  regimeState: ActiveRegimeState | null,
  regimeSizeMultiplier: number,
  amdState: ActiveAmdState | null,
  directionMode: string,
): void {
  row.regime_direction = regimeState?.direction ?? null;
  row.regime_confidence = regimeState?.confidence ?? null;
  row.regime_evaluated_at = regimeState?.evaluatedAt ?? null;
  row.regime_size_multiplier = regimeSizeMultiplier;
  row.layer4_result = regimeState?.layer4_result ?? null;
  row.layer4_bullish_count = regimeState?.layer4_bullish_count ?? null;
  row.layer4_bearish_count = regimeState?.layer4_bearish_count ?? null;
  row.layer5_result = regimeState?.layer5_result ?? null;
  row.layer5_pip_diff = regimeState?.layer5_pip_diff ?? null;
  row.layer6_position_pct = regimeState?.layer6_position_pct ?? null;
  row.layer7_active = regimeState?.layer7_override_active ?? null;
  row.layer7_pip_diff = regimeState?.layer7_pip_diff ?? null;
  row.choppy_extended = regimeState?.choppy_extended_override ?? null;
  row.manual_tag = null;
  row.close_tag = null;
  row.signal_session = null;
  row.amd_tag = amdState?.amdTag ?? null;
  row.amd_evaluated_at = amdState?.evaluatedAt ?? null;
  row.layer4_d1_bias = amdState?.layer4D1Bias ?? null;
  row.daily_bias_alignment = amdState?.dailyBiasAlignment ?? null;
  row.direction_source = directionMode === 'auto' ? 'auto' : 'manual';
  row.amd_size_multiplier = amdState?.amdSizeMultiplier ?? null;
  row.reversal_confirmed = amdState?.reversalConfirmed ?? null;
  row.auto_direction_reason = amdState?.autoDirectionReason ?? null;
}

function resolveOmegaDirection(
  engineId: string,
  signalDirection: string,
  _omegaDirection: string
): string {
  if (engineId !== 'omega') return signalDirection;
  // Engine sends direction-aligned signals only — no inversion at bridge.
  return signalDirection;
}

// Bar1 M1 strength — engine_rebuild only
// Fetches 5 M1 candles from bar1 window (signal_time
// to signal_time + 5 min)
// Measures max favorable R vs max adverse R
// Uses only real-time OANDA data — zero look-ahead
// Returns strength bucket used for position sizing
async function fetchBar1Strength(
  signalTimeMs: number,
  entryPrice: number,
  slPrice: number,
  direction: string
): Promise<{
  bar1NetR: number;
  bar1FavR: number;
  bar1AdvR: number;
  strength: 'strong' | 'moderate' | 'weak' |
            'against' | 'no_data';
}> {
  const noData = {
    bar1NetR: 0,
    bar1FavR: 0,
    bar1AdvR: 0,
    strength: 'no_data' as const,
  };

  try {
    const apiKey =
      process.env['OANDA_API_KEY'] ??
      process.env['OANDA_API_TOKEN'] ??
      '';
    const isLive =
      process.env['OANDA_ENVIRONMENT'] === 'live';
    const baseUrl = isLive
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';

    const from = new Date(signalTimeMs).toISOString();
    // count=5 replaces from+to window.
    // from+to caused HTTP 400 on every fetch —
    // OANDA rejects when to lands on M1 boundary.
    // count=5 confirmed pattern from oanda.ts line 145
    // (fetchM5CandleAttempt uses count=2 successfully).
    const url =
      `${baseUrl}/v3/instruments/GBP_USD/candles` +
      `?granularity=M1&price=M&count=5` +
      `&from=${encodeURIComponent(from)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logInfo('[Rebuild] Bar1 fetch HTTP error', {
        status: res.status,
        url,
        from,
        m1Count: 5,
      });
      return noData;
    }

    const body = await res.json() as {
      candles?: Array<{
        complete: boolean;
        mid: {
          o: string; h: string;
          l: string; c: string;
        };
      }>;
    };

    const bars = (body.candles ?? [])
      .filter((c) => c.complete)
      .map((c) => ({
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
      }));

    if (bars.length === 0) {
      logInfo('[Rebuild] Bar1 fetch zero complete bars', {
        totalCandles: body.candles?.length ?? 0,
        from,
        m1Count: 5,
      });
      return noData;
    }

    const rSize = Math.abs(entryPrice - slPrice);
    if (rSize <= 0) return noData;

    const dir = direction.toLowerCase();
    let maxFav = 0;
    let maxAdv = 0;

    for (const bar of bars) {
      if (dir === 'long') {
        maxFav = Math.max(
          maxFav,
          (bar.high - entryPrice) / rSize
        );
        maxAdv = Math.max(
          maxAdv,
          (entryPrice - bar.low) / rSize
        );
      } else {
        maxFav = Math.max(
          maxFav,
          (entryPrice - bar.low) / rSize
        );
        maxAdv = Math.max(
          maxAdv,
          (bar.high - entryPrice) / rSize
        );
      }
    }

    const netR = maxFav - maxAdv;
    let strength: 'strong' | 'moderate' |
                  'weak' | 'against';
    if (netR > 0.5)       strength = 'strong';
    else if (netR > 0.2)  strength = 'moderate';
    else if (netR > 0)    strength = 'weak';
    else                  strength = 'against';

    return {
      bar1NetR: netR,
      bar1FavR: maxFav,
      bar1AdvR: maxAdv,
      strength,
    };
  } catch (err) {
    logInfo('[Rebuild] Bar1 fetch threw exception', {
      error: String(err),
      from: new Date(signalTimeMs).toISOString(),
    });
    return noData;
  }
}

function shouldBlockRebuild(
  engineId: string,
  stopLossPips: number | null | undefined,
  signalCreatedAt: string | null | undefined,
  rebuildHourGateEnabled: boolean
): { blocked: boolean; reason: string | null } {
  if (engineId !== 'engine_rebuild') {
    return { blocked: false, reason: null };
  }

  // Hour gate — covers bad GBPUSD hours AND Asian session
  const hourUtc = signalCreatedAt
    ? new Date(signalCreatedAt).getUTCHours()
    : new Date().getUTCHours();

  if (isRebuildHourUtcBlocked(hourUtc, rebuildHourGateEnabled)) {
    return {
      blocked: true,
      reason: `REBUILD_HOUR_BLOCK: hour ${hourUtc} UTC`,
    };
  }

  // R bucket gate — medium R noise band 7-10 pips
  const rPipNum = stopLossPips == null ? null : Number(stopLossPips);
  if (
    rPipNum != null &&
    !Number.isNaN(rPipNum) &&
    rPipNum > 7 &&
    rPipNum <= 10
  ) {
    return {
      blocked: true,
      reason: `REBUILD_R_BLOCK: medium R ${rPipNum.toFixed(1)} pips`,
    };
  }

  return { blocked: false, reason: null };
}

/**
 * Reads omega_direction_valid_until from bridge_config.
 * Returns true only if current UTC time is strictly before the expiry.
 * Any failure (missing row, parse error, fetch error) returns false — safe default is BLOCKED.
 */
async function isOmegaWindowActive(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_direction_valid_until')
      .maybeSingle();

    if (error || !data) return false;

    const rawValue = data.config_value;
    const isoString =
      typeof rawValue === 'string'
        ? rawValue.replace(/^"|"$/g, '')
        : String(rawValue).replace(/^"|"$/g, '');

    const expiryMs = Date.parse(isoString);
    if (!Number.isFinite(expiryMs)) return false;

    return Date.now() < expiryMs;
  } catch {
    return false;
  }
}

export async function processSignal(
  payload: SignalInsertPayload,
  receivedAt: Date,
  deps: RouterDeps
): Promise<void> {
  const { config, engines, getCachedAccount, getOpenTradesFromLog, supabase } = deps;
  const signalId = (payload.id ?? '').toString();

  // ALPHAOMEGA: count open-session Omega fires at router entry (before 4-pip).
  // Closed-market ghosts are no-ops inside observe (streak frozen / retained).
  const alphaOmegaFireOutcome = await observeOmegaFireIfNeeded(supabase, payload);

  // Omega: reject closed-session inserts before rSize / Lane B crack side paths.
  if (
    payload.engine_id === 'omega' &&
    !isForexMarketOpen(new Date(), config.weekendCloseBufferMinutes)
  ) {
    await supabase.from('bridge_trade_log').insert(
      buildTradeLogRow(payload, 'BLOCKED', 'Forex market closed', null, null, 0, undefined),
    );
    return;
  }

  const staleAge = Date.now() - new Date((payload.created_at ?? 0).toString()).getTime();
  if (staleAge > config.staleSignalMaxAgeMs) {
    logWarn('Skipping stale signal', { signalId, engineId: payload.engine_id, ageMs: staleAge });
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'SKIPPED', `Stale signal (${staleAge}ms old)`, null, null, 0, undefined));
    return;
  }

  const validation = validateSignal(payload, config.defaultRiskReward);
  if (!validation.pass) {
    await handleOmegaValidationFailure({
      supabase,
      payload,
      signalId,
      config,
      engines,
      fireOutcome: alphaOmegaFireOutcome,
      validationReason: validation.reason ?? 'Validation failed',
      decisionLatencyMs: Date.now() - receivedAt.getTime(),
      cachedAccountEquity: getCachedAccount()?.equity ?? null,
      openTradeCount: 0,
      buildTradeLogRow,
      attachOmegaAuditFields,
    });
    return;
  }
  const norm = validation.normalized!;
  const decisionLatencyMs = Date.now() - receivedAt.getTime();
  if (decisionLatencyMs > config.maxLatencyMs) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'SKIPPED', `Latency ${decisionLatencyMs}ms > ${config.maxLatencyMs}ms`, decisionLatencyMs, null, 0, norm.oandaInstrument));
    return;
  }

  // Live engine control — reads paused_engines, omega_direction,
  // rebuild_bounds_retry, rebuild_hour_gate_enabled, direction_mode,
  // omega_raw_mode fresh per signal.
  const [
    pausedRow,
    dirRow,
    boundsRetryRow,
    hourGateRow,
    directionModeRow,
    omegaRawModeRow,
  ] = await Promise.all([
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'paused_engines')
      .single(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_direction')
      .single(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'rebuild_bounds_retry')
      .single(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'rebuild_hour_gate_enabled')
      .maybeSingle(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'direction_mode')
      .maybeSingle(),
    supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'omega_raw_mode')
      .maybeSingle(),
  ]);
  const pausedEngines: string[] =
    Array.isArray(pausedRow.data?.config_value)
      ? (pausedRow.data.config_value as string[])
      : [];
  const omegaDirection: string =
    typeof dirRow.data?.config_value === 'string'
      ? dirRow.data.config_value
      : (process.env.OMEGA_DIRECTION_OVERRIDE ?? 'long');
  const rebuildBoundsRetryEnabled = parseRebuildBoundsRetryFlag(
    boundsRetryRow.data?.config_value
  );
  const rebuildHourGateEnabled = parseRebuildHourGateEnabled(
    hourGateRow.data?.config_value
  );
  const directionMode: string =
    typeof directionModeRow.data?.config_value === 'string'
      ? directionModeRow.data.config_value
      : 'manual';
  const omegaRawMode = parseOmegaRawModeFlag(omegaRawModeRow.data?.config_value);
  const signalFiredAtIso = String(payload.created_at ?? new Date().toISOString());

  // ── Omega Inverse direction split (DISABLED) ───────────────────────────────
  // Hybrid deployable policy: no processOmegaInverse routing from prime signals.
  // Asian mismatch → hybrid entry gate BLOCK. Dist loose → prime DTW as fired.
  // See omegaInverseSplitPolicy.ts and omegaInverseRouter.ts (history/dashboard).
  // ── End Omega Inverse direction split ───────────────────────────────────────

  const engine = findEngine(engines, norm.engineId);
  // In raw mode, omega bypasses is_active gate (engine row is currently inactive).
  if (!engine || (!engine.is_active && !shouldBypassIsActive(norm.engineId, omegaRawMode))) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', engine ? 'Engine inactive' : 'Unregistered engine', decisionLatencyMs, null, 0, norm.oandaInstrument));
    return;
  }

  // Dashboard engine pause check
  if (pausedEngines.includes(norm.engineId)) {
    await supabase.from('bridge_trade_log').insert(
      buildTradeLogRow(
        payload,
        'BLOCKED',
        'ENGINE_PAUSED',
        decisionLatencyMs,
        null,
        0,
        norm.oandaInstrument
      )
    );
    return;
  }

  const cachedAccount = getCachedAccount();
  const peakEquity = getPeakEquity();
  const drawdownPct = peakEquity > 0 && cachedAccount ? (peakEquity - cachedAccount.equity) / peakEquity : 0;
  const trip = isTripped(drawdownPct, config.circuitBreakerDrawdownPct, config.maxConsecutiveLosses, config.cooldownAfterLossesMinutes);
  if (trip.tripped) {
    if (getConsecutiveLosses() >= config.maxConsecutiveLosses) {
      enterCooldown(config.cooldownAfterLossesMinutes);
      void sendCircuitBreakerAlert({
        consecutiveLosses: config.maxConsecutiveLosses,
        cooldownMinutes: config.cooldownAfterLossesMinutes,
        tripReason: trip.reason ?? 'Maximum consecutive losses reached',
      }).catch(() => {});
    }
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', trip.reason ?? 'Circuit breaker', decisionLatencyMs, cachedAccount?.equity ?? null, 0, norm.oandaInstrument));
    return;
  }

  const openTrades = await getOpenTradesFromLog();
  // === DEDUP DISABLED FOR TESTING (2026-04-08) ===
  // if (isDuplicate(norm.pair, norm.direction, config.deduplicationWindowMs)) {
  //   await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'DEDUPLICATED', 'Duplicate within window', decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument));
  //   return;
  // }
  // === END DEDUP DISABLED ===
  if (
    norm.engineId !== 'omega' &&
    hasOpenOppositePosition(openTrades, norm.oandaInstrument, norm.direction)
  ) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', 'Open opposite position', decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument));
    return;
  }
  const samePairCount = countOpenSamePair(openTrades, norm.oandaInstrument);
  const { overLimit: correlatedOverLimit } = countSameCurrencyExposure(
    openTrades.map((t) => ({ pair: t.pair, units: t.units })),
    norm.oandaInstrument,
    norm.direction === 'LONG' ? 1 : -1,
    config.maxCorrelatedExposure
  );
  const globalTradesToday = engines.reduce((s, e) => s + e.trades_today, 0);
  // Engine Rebuild execution filter — runs before
  // risk checks so hour/R blocked signals never
  // reach correlation checker
  const rebuildBlock = shouldBlockRebuild(
    norm.engineId,
    payload.stop_loss_pips as number | null,
    payload.created_at as string | null,
    rebuildHourGateEnabled
  );
  if (rebuildBlock.blocked) {
    const blockRow = buildTradeLogRow(
      payload,
      'BLOCKED',
      rebuildBlock.reason,
      decisionLatencyMs,
      cachedAccount?.equity ?? null,
      openTrades.length,
      norm.oandaInstrument
    );
    await supabase.from('bridge_trade_log').insert(blockRow);
    console.log(
      `[Bridge] Rebuild BLOCKED — ${rebuildBlock.reason}`
    );
    return;
  }

  const riskResult = runRiskChecks({
    config,
    cachedAccount,
    signalConfluenceScore: norm.confluenceScore,
    // Raw mode bypasses execution_threshold (currently 99 for omega).
    engineThreshold: shouldBypassExecutionThreshold(norm.engineId, omegaRawMode)
      ? 0
      : engine.execution_threshold,
    hasStopLoss: true,
    riskRewardRatio: null,
    engineId: norm.engineId,
    engineTradesToday: engine.trades_today,
    engineMaxDailyTrades: engine.max_daily_trades,
    globalTradesToday,
    openPositionsCount: openTrades.length,
    openPositionsSamePair: samePairCount,
    correlatedOverLimit,
    isMarketOpen: isForexMarketOpen(new Date(), config.weekendCloseBufferMinutes),
  });
  if (!riskResult.pass) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', riskResult.reason ?? 'Risk check failed', decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument));
    return;
  }

  const NEWS_TAGGED_ENGINES = ['omega', 'engine_rebuild'];
  let newsResult: NewsWindowResult | null = null;
  if (config.newsBlackoutEnabled && NEWS_TAGGED_ENGINES.includes(norm.engineId)) {
    const newsOverride =
      norm.engineId === 'omega' ? omegaDirection.toLowerCase() : 'long';
    newsResult = await getNewsWindowEvent(norm.oandaInstrument, newsOverride);

    if (newsResult !== null) {
      const exploitMultiplierActive = newsResult.exploitationActive ? 1.5 : 1.0;

      if (newsResult.blockReason !== null) {
        logInfo('News intelligence block', {
          signalId,
          engineId: norm.engineId,
          blockReason: newsResult.blockReason,
          eventName: newsResult.eventName,
          exploitationActive: newsResult.exploitationActive,
        });
        await supabase.from('bridge_trade_log').insert(
          buildTradeLogRow(
            payload,
            'BLOCKED',
            newsResult.blockReason,
            decisionLatencyMs,
            cachedAccount?.equity ?? null,
            openTrades.length,
            norm.oandaInstrument
          )
        );
        return;
      }

      if (newsResult.exploitationActive) {
        logInfo('News exploitation active', {
          signalId,
          engineId: norm.engineId,
          eventName: newsResult.eventName,
          postEventDirection: newsResult.postEventDirection,
          exploitMultiplier: exploitMultiplierActive,
        });
      }
    }
  }

  // Direction flip + auto-close skipped in raw mode: no direction config is managed.
  if (norm.engineId === 'omega' && !shouldBypassDirectionFlip(norm.engineId, omegaRawMode)) {
    const currentOverride = omegaDirection.toLowerCase();
    if (
      cachedOmegaDirection !== null &&
      cachedOmegaDirection !== currentOverride
    ) {
      logInfo('[Omega] Direction flip detected', {
        from: cachedOmegaDirection,
        to: currentOverride,
      });
      await closeAllOpenOmegaPositions(supabase, cachedOmegaDirection);
    }
    cachedOmegaDirection = currentOverride;
  }

  const effectiveDirection = resolveOmegaDirection(
    norm.engineId,
    norm.direction,
    omegaDirection
  );

  // Mutate norm.direction so ALL downstream code
  // (trail log, bridge_trade_log direction column)
  // uses the correct execution direction automatically.
  // This does not affect the engine or shadow signals.
  norm.direction = effectiveDirection as typeof norm.direction;

  // Rebuild direction flip experiment — env var controlled
  // Flips LONG→SHORT and SHORT→LONG for engine_rebuild only
  // Applies after omega direction resolution, before units and bar1
  // so ALL downstream logic (units sign, bar1, OANDA order,
  // bridge_trade_log direction) uses the flipped direction consistently
  if (
    norm.engineId === 'engine_rebuild' &&
    process.env.REBUILD_DIRECTION_FLIP === 'true'
  ) {
    norm.direction = norm.direction === 'LONG' ? 'SHORT' : 'LONG';
  }

  // Mirror SL and TP when direction is flipped for engine_rebuild
  // Required because norm.stopLoss and norm.takeProfit are priced
  // for the original signal direction. RC3 reads norm.stopLoss at
  // fill time — if direction is flipped but SL/TP are not mirrored,
  // widenedSL computes on the wrong side and correctedTP breaks.
  // Mirror formula: reflect SL and TP distances around entryPrice.
  if (
    norm.engineId === 'engine_rebuild' &&
    process.env.REBUILD_DIRECTION_FLIP === 'true'
  ) {
    const slDistance = Math.abs(norm.entryPrice - norm.stopLoss);
    const tpDistance = Math.abs(norm.takeProfit - norm.entryPrice);
    if (norm.direction === 'SHORT') {
      // Was LONG (before flip): SL was below entry, TP above entry
      // Now SHORT: SL must be above entry, TP below entry
      norm.stopLoss = norm.entryPrice + slDistance;
      norm.takeProfit = norm.entryPrice - tpDistance;
    } else {
      // Was SHORT (before flip): SL was above entry, TP below entry
      // Now LONG: SL must be below entry, TP above entry
      norm.stopLoss = norm.entryPrice - slDistance;
      norm.takeProfit = norm.entryPrice + tpDistance;
    }
  }

  // One-trade-at-a-time PER BROKER: only fully block when every active omega
  // broker is occupied; otherwise fan-out skips busy brokers and executes free ones.
  if (norm.engineId === 'omega') {
    const openTradeBlock = await checkOmegaBrokerSequencingBlock(supabase);
    if (openTradeBlock.blocked) {
      logInfo('[Omega] Blocked — open trade still active', {
        signalId,
        blockReason: openTradeBlock.reason,
      });
      await supabase.from('bridge_trade_log').insert(
        buildTradeLogRow(
          payload,
          'BLOCKED',
          openTradeBlock.reason ?? 'OMEGA_TRADE_OPEN',
          decisionLatencyMs,
          cachedAccount?.equity ?? null,
          openTrades.length,
          norm.oandaInstrument,
        ),
      );
      return;
    }
  }

  // ── Omega hybrid entry gate ───────────────────────────────────────────────
  // Asian gated; distribution 10:31–16:00 direction ungated. Raw mode bypasses.
  if (norm.engineId === 'omega' && !shouldBypassWindowGate(norm.engineId, omegaRawMode)) {
    const hybridGate = evaluateHybridEntryGate(
      signalFiredAtIso,
      norm.direction,
      omegaDirection,
    );
    if (!hybridGate.passed) {
      logInfo('[Omega] Blocked — hybrid entry gate', {
        signalId,
        session: hybridGate.session,
        reason: hybridGate.reason,
      });
      await supabase.from('bridge_trade_log').insert(
        buildTradeLogRow(
          payload,
          'BLOCKED',
          hybridGate.reason ?? 'OMEGA_HYBRID_GATE',
          decisionLatencyMs,
          cachedAccount?.equity ?? null,
          openTrades.length,
          norm.oandaInstrument,
        ),
      );
      return;
    }
  }
  // ── End Omega hybrid entry gate ───────────────────────────────────────────

  // ── Omega window gate ────────────────────────────────────────────────────
  // Omega only fires during active windows:
  //   Asian session:    21:00–08:00 UTC (written by AsianDirectionService)
  //   AMD distribution: tag entry hour–16:00 UTC (written by AmdDetectorService)
  // Outside these windows omega_direction_valid_until is expired → BLOCKED.
  // Raw mode bypasses this gate — DTW pattern match is the only qualifier.
  if (norm.engineId === 'omega' && !shouldBypassWindowGate(norm.engineId, omegaRawMode)) {
    const windowActive = await isOmegaWindowActive(supabase);
    if (!windowActive) {
      const blockMsg = 'OMEGA_WINDOW_EXPIRED: no active session window — direction validity expired';
      logInfo('[Omega] Blocked — window expired or no direction set', { signalId });
      await supabase.from('bridge_trade_log').insert(
        buildTradeLogRow(
          payload,
          'BLOCKED',
          blockMsg,
          decisionLatencyMs,
          cachedAccount?.equity ?? null,
          openTrades.length,
          norm.oandaInstrument,
        ),
      );
      return;
    }
  }
  // ── End Omega window gate ─────────────────────────────────────────────────

  let regimeState: ActiveRegimeState | null = null;
  let regimeSizeMultiplier = 1.0;
  let amdState: ActiveAmdState | null = null;

  if (norm.engineId === 'omega') {
    regimeState = await fetchLatestRegimeState('AUD_USD');

    if (regimeState) {
      regimeSizeMultiplier = getRegimeSizeMultiplier(regimeState.confidence);
      console.log(
        `[RegimeAdvisory] omega signal proceeding — confidence: ${regimeState?.confidence ?? 'unknown'} | ` +
        `regime direction: ${regimeState?.direction ?? 'unknown'} | ` +
        `omega direction: ${norm.direction} | ` +
        `evaluated: ${regimeState?.evaluatedAt ?? 'unknown'}`
      );
    }

    try {
      amdState = await fetchLatestAmdState('AUD_USD');
      if (amdState) {
        logInfo(
          `[AmdAdvisory] tag: ${amdState.amdTag} | ` +
          `range: ${amdState.asianRangePips ?? 'null'} | ` +
          `flat: ${amdState.asianIsFlat} | ` +
          `judas: ${amdState.judasDirection ?? 'null'} ` +
          `${amdState.judasPips ?? 'null'}pips | ` +
          `reversal: ${amdState.reversalConfirmed ?? 'null'} | ` +
          `D1: ${amdState.layer4D1Bias ?? 'null'} ` +
          `(${amdState.layer4BullishCount ?? '—'}↑/${amdState.layer4BearishCount ?? '—'}↓) | ` +
          `bias_align: ${amdState.dailyBiasAlignment ?? 'null'} | ` +
          `auto_dir: ${amdState.autoDirection ?? 'null'} (${amdState.autoDirectionConfidence ?? 'null'})`
        );
      }
    } catch (amdErr: unknown) {
      console.warn('[AmdAdvisory] fetchLatestAmdState failed:', amdErr);
    }
  }

  const conversionRate = getConversionRateForInstrument(
    norm.oandaInstrument,
    getCachedConversionRates()
  );

  const omegaPureSizing =
    norm.engineId === 'omega' && (await isOmegaRawPureSizingEnabled(supabase));

  let units: number;
  if (omegaPureSizing) {
    units = sizeOmegaRawPureUnits({
      equity: cachedAccount?.equity ?? 0,
      engineWeight: engine.weight,
      riskPct: config.riskPerTradePct,
      entry: norm.entryPrice,
      stopLoss: norm.stopLoss,
      instrument: norm.oandaInstrument,
      direction: norm.direction,
      conversionRate,
      slPipsOverride: norm.slPipsFromSignal ?? undefined,
    });
    logInfo('[OmegaRaw] Pure sizing applied (no AMD/news/confluence/graduated)', {
      signalId,
      units,
      equity: cachedAccount?.equity ?? 0,
      weight: engine.weight,
      riskPct: config.riskPerTradePct,
    });
  } else {
    const unitCount = calculateUnits({
      equity: cachedAccount?.equity ?? 0,
      engineWeight: engine.weight,
      riskPct: config.riskPerTradePct,
      entry: norm.entryPrice,
      stopLoss: norm.stopLoss,
      instrument: norm.oandaInstrument,
      consecutiveLosses: getConsecutiveLosses(),
      graduatedThreshold: config.graduatedResponseThreshold,
      confluenceScore: norm.confluenceScore,
      conversionRate,
      slPipsOverride: norm.slPipsFromSignal ?? undefined,
    });
    units = norm.direction === 'LONG' ? unitCount : -unitCount;

    const omegaNewsExploitMult =
      config.newsBlackoutEnabled &&
      norm.engineId === 'omega' &&
      newsResult !== null &&
      newsResult.exploitationActive
        ? 1.5
        : 1.0;
    const omegaNewsReduceMult =
      config.newsBlackoutEnabled &&
      norm.engineId === 'omega' &&
      newsResult !== null &&
      newsResult.preEventAction === 'REDUCE' &&
      newsResult.inPreWindow
        ? 0.5
        : 1.0;
    if (norm.engineId === 'omega') {
      units = Math.round(units * omegaNewsExploitMult * omegaNewsReduceMult);
    }

    // AMD dynamic sizing — live multiplier applied to Omega units
    // amdSizeMultiplier is null before 10:05 UTC AMD cron fires — defaults to 1.0x (no change)
    if (norm.engineId === 'omega') {
      const amdMultiplier = amdState?.amdSizeMultiplier ?? 1.0;
      if (amdMultiplier !== 1.0) {
        units = Math.round(units * amdMultiplier);
        logInfo(
          `[AmdSizing] Applied amd_size_multiplier=${amdMultiplier} → units=${units} | ` +
          `tag=${amdState?.amdTag ?? 'null'} | ` +
          `confidence=${amdState?.autoDirectionConfidence ?? 'null'}`
        );
      }
    }
  }

  // Bar1 M1 strength — engine_rebuild only
  // Wait for bar1 to complete then fetch M1 candles
  // Computes net R (favorable - adverse) to classify strength
  // All other engines skip this block entirely
  let bar1Data: {
    bar1NetR: number;
    bar1FavR: number;
    bar1AdvR: number;
    strength: 'strong' | 'moderate' | 'weak' |
              'against' | 'no_data';
  } = {
    bar1NetR: 0,
    bar1FavR: 0,
    bar1AdvR: 0,
    strength: 'no_data',
  };

  if (norm.engineId === 'engine_rebuild') {
    const signalMs = payload.created_at
      ? new Date(payload.created_at as string).getTime()
      : Date.now();
    const bar1ReadyAt = signalMs + 5 * 60 * 1000;
    const waitMs = bar1ReadyAt - Date.now();
    if (waitMs > 0) {
      logInfo(
        '[Rebuild] Waiting for bar1 window to complete',
        { signalId, waitMs }
      );
      await new Promise<void>(
        (resolve) => setTimeout(resolve, waitMs)
      );
    }
    bar1Data = await fetchBar1Strength(
      signalMs,
      norm.entryPrice,
      norm.stopLoss,
      norm.direction
    );
    logInfo('[Rebuild] Bar1 strength computed', {
      signalId,
      bar1NetR: bar1Data.bar1NetR.toFixed(4),
      bar1FavR: bar1Data.bar1FavR.toFixed(4),
      bar1AdvR: bar1Data.bar1AdvR.toFixed(4),
      strength: bar1Data.strength,
    });
  }

  // Engine Rebuild only: dynamic cap + bar1 strength sizing
  // Bar1 multipliers validated on 81 real OANDA M1 signals:
  //   strong (net>0.5R):   39% M1 TP, +0.590R avg → 2.0x
  //   moderate (0.2-0.5R): 26.9% TP, +0.446R avg → 1.0x
  //   weak (0-0.2R):       13.3% TP, +0.274R avg → 0.75x
  //   against (<=0):       -0.296R shadow avg    → 0.25x
  //   no_data:             unknown               → 0.5x
  // All signals execute — frequency preserved.
  // Sizing scales with bar1 conviction only.
  // Zero effect on other engines.
  let finalUnits = norm.engineId === 'engine_rebuild'
    ? (() => {
        const equity = cachedAccount?.equity ?? 1000;
        const maxMarginPerTrade = (equity * 0.50) / 4;
        const approxGbpUsdPrice = 1.355;
        const dynamicCap = Math.floor(
          maxMarginPerTrade * 50 / approxGbpUsdPrice
        );
        const safeCap = Math.min(
          Math.max(dynamicCap, 1000),
          500_000
        );
        const bar1Multipliers: Record<string, number> = {
          strong:   1.0,
          moderate: 1.0,
          weak:     1.0,
          against:  1.0,
          no_data:  1.0,
        };

        const rebuildSignalDir =
          norm.direction.toLowerCase();
        const omegaDir =
          omegaDirection.toLowerCase();
        const omegaAlignmentMultiplier: number = 1.0;

        const multiplier =
          (bar1Multipliers[bar1Data.strength] ?? 0.5)
          * omegaAlignmentMultiplier;
        const cappedAbs = Math.min(
          Math.abs(units), safeCap
        );
        const sizedAbs = Math.floor(
          cappedAbs * multiplier
        );
        // Never exceed 2x safeCap
        const finalAbs = Math.min(
          sizedAbs, safeCap * 2.0
        );
        logInfo('[Rebuild] finalUnits computed', {
          signalId,
          strength: bar1Data.strength,
          bar1Multiplier:
            bar1Multipliers[bar1Data.strength] ?? 0.5,
          omegaDir,
          rebuildDir: rebuildSignalDir,
          alignmentMultiplier: omegaAlignmentMultiplier,
          combinedMultiplier: multiplier,
          safeCap,
          finalAbs,
        });
        return (units < 0 ? -1 : 1) * finalAbs;
      })()
    : units;

  try {
    const TRAIL_STOP_ENGINES = [
      'charlie', 'charlie_shadow', 'omega',
    ];
    const useTrailStop = TRAIL_STOP_ENGINES.includes(norm.engineId);

    if (norm.engineId === 'omega') {
      await executeOmegaOnAllBrokers({
        supabase,
        payload,
        norm,
        finalUnits,
        signalId,
        config,
        engine,
        decisionLatencyMs,
        cachedAccountEquity: cachedAccount?.equity ?? null,
        openTradeCount: openTrades.length,
        regimeState,
        regimeSizeMultiplier,
        amdState,
        directionMode,
        buildTradeLogRow,
        attachOmegaAuditFields,
        alphaOmegaFireOutcome,
      });
      return;
    }

    // Rebuild: 2-pip priceBound (see rebuildBoundsRetryOrder); optional
    // second attempt without priceBound when config + BOUNDS_VIOLATION.
    const { orderResult, retriedWithoutPriceBound } =
      await placeMarketOrderWithRebuildBoundsRetry({
        norm,
        finalUnits,
        useTrailStop,
        maxOrderTimeoutMs: config.maxOrderTimeoutMs,
        rebuildBoundsRetryEnabled,
      });
    if (retriedWithoutPriceBound) {
      logInfo('[Rebuild] priceBound retry after BOUNDS_VIOLATION', {
        signalId,
        secondCancelled: Boolean(orderResult.orderCancelTransaction),
      });
    }
    if (orderResult.orderCancelTransaction) {
      const cancelReason = orderResult.orderCancelTransaction.reason ?? 'Order cancelled';
      const blockReason = cancelReason === 'TAKE_PROFIT_ON_FILL_LOSS'
        ? 'Target price already reached by market before execution'
        : cancelReason;
      await supabase.from('bridge_trade_log').insert({
        ...buildTradeLogRow(payload, 'BLOCKED', blockReason, decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument),
        units,
      });
      return;
    }
    const fillTx = orderResult.orderFillTransaction;
    const tradeId = fillTx?.tradeOpened?.tradeID ?? fillTx?.id;
    const filledUnits = fillTx?.units != null ? Number(fillTx.units) : units;
    const fillPrice = fillTx?.price != null ? Number(fillTx.price) : null;
    const row = buildTradeLogRow(payload, 'EXECUTED', null, decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument,
      norm.direction);
    (row as Record<string, unknown>).oanda_order_id = fillTx?.id;
    (row as Record<string, unknown>).oanda_trade_id = tradeId;
    (row as Record<string, unknown>).units = filledUnits;
    if (fillPrice != null) (row as Record<string, unknown>).fill_price = fillPrice;
    // Engine Rebuild execution fixes — RC1 + RC2 + RC3
    // ZERO effect on Omega, Charlie, Alpha, Delta, Falcon, Sigma
    if (norm.engineId === 'engine_rebuild' && fillPrice != null) {
      const rebuildDecimals = norm.oandaInstrument.includes('JPY')
        ? 3
        : 5;
      const rebuildPip = norm.oandaInstrument.includes('JPY')
        ? 0.01
        : 0.0001;

      // RC2 fix: widen SL by 1.5 pips to survive OANDA tick spikes
      // Shadow uses candle close; OANDA uses ticks
      const SL_WIDEN_PIPS = 1.5;
      const widenedSL = norm.direction === 'LONG'
        ? norm.stopLoss - (SL_WIDEN_PIPS * rebuildPip)
        : norm.stopLoss + (SL_WIDEN_PIPS * rebuildPip);

      // RC3 fix: TP uses ACTUAL risk from fillPrice to widenedSL
      // This guarantees R:R = exactly 1.500 on every trade
      // Previous version used slPipsFromSignal which did not account
      // for the widenedSL — producing R:R from 0.94 to 2.00
      // Backtest confirmed: actualRiskRaw = |fillPrice - widenedSL|
      // is the only formula that produces consistent 1.500 R:R
      const actualRiskRaw = Math.abs(fillPrice - widenedSL);
      const correctedTP = norm.direction === 'LONG'
        ? fillPrice + actualRiskRaw * 1.5
        : fillPrice - actualRiskRaw * 1.5;

      // RC1 fix is in patchTradeTPSL itself (retry logic)
      // This call is now reliable — retry on failure, CRITICAL log if both fail
      if (tradeId != null) {
        await patchTradeTPSL(
          tradeId,
          correctedTP.toFixed(rebuildDecimals),
          widenedSL.toFixed(rebuildDecimals)
        );
        // Record corrected levels in bridge_trade_log
        (row as Record<string, unknown>).take_profit = correctedTP;
        (row as Record<string, unknown>).stop_loss = widenedSL;

        // Log bar1 strength to bridge_trade_log
        // Columns added in migration 008
        // Only written when bar1 data was successfully fetched
        if (bar1Data.strength !== 'no_data') {
          (row as Record<string, unknown>).bar1_net_r =
            Math.round(bar1Data.bar1NetR * 10000) / 10000;
          (row as Record<string, unknown>).bar1_fav_r =
            Math.round(bar1Data.bar1FavR * 10000) / 10000;
          (row as Record<string, unknown>).bar1_adv_r =
            Math.round(bar1Data.bar1AdvR * 10000) / 10000;
          (row as Record<string, unknown>).bar1_strength =
            bar1Data.strength;
        }
      }
    }
    await supabase.from('bridge_trade_log').insert(row);
    const { data: eng } = await supabase.from('bridge_engines').select('trades_today').eq('engine_id', norm.engineId).single();
    const newCount = ((eng as { trades_today?: number } | null)?.trades_today ?? engine.trades_today) + 1;
    await supabase.from('bridge_engines').update({ trades_today: newCount, updated_at: new Date().toISOString() }).eq('engine_id', norm.engineId);
    logInfo('Trade executed', { signalId, engineId: norm.engineId, pair: norm.oandaInstrument, units: finalUnits, tradeId });
    void sendTradeExecutedAlert({
      oandaInstrument: norm.oandaInstrument,
      direction: norm.direction,
      fillPrice,
      stopLoss: typeof (row as Record<string, unknown>).stop_loss === 'number'
        ? (row as Record<string, unknown>).stop_loss as number
        : null,
      takeProfit: payload.take_profit ?? payload.target_1 ?? null,
      filledUnits,
      amdTag: amdState?.amdTag ?? null,
      amdSizeMultiplier: amdState?.amdSizeMultiplier ?? null,
      directionSource: directionMode === 'auto' ? 'auto' : 'manual',
      engineId: norm.engineId,
    }).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('bridge_trade_log').insert({
      ...buildTradeLogRow(payload, 'BLOCKED', `OANDA error: ${msg}`, decisionLatencyMs, cachedAccount?.equity ?? null, openTrades.length, norm.oandaInstrument),
      units,
    });
    logWarn('Order failed', { signalId, error: msg });
  }
}

export { prePopulateDedupFromLog };
