/**
 * Signal router: validate → Check 1 (engine) → 2 (circuit) → 3 (conflict/dedup) → 4 (risk) → 5 (latency) → 6 (execute).
 * Log every decision to bridge_trade_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../types/config.js';
import type { AccountSummary } from '../connectors/oanda.js';
import type { DecisionType } from '../types/signals.js';
import { validateSignal } from './signalValidation.js';
import { isTripped, getPeakEquity, getConsecutiveLosses, enterCooldown } from './circuitBreaker.js';
import { isDuplicate, hasOpenOppositePosition, countOpenSamePair, prePopulateDedupFromLog } from './conflictResolver.js';
import { countSameCurrencyExposure } from './correlationChecker.js';
import { runRiskChecks } from './riskManager.js';
import { calculateUnits } from './positionSizer.js';
import { patchTradeTPSL } from '../connectors/oanda.js';
import {
  parseRebuildBoundsRetryFlag,
  placeMarketOrderWithRebuildBoundsRetry,
} from './rebuildBoundsRetryOrder.js';
import { logInfo, logWarn } from '../utils/logger.js';
import { toOandaInstrument } from '../utils/pairs.js';
import { isForexMarketOpen } from '../utils/time.js';
import { getCachedConversionRates } from '../monitoring/heartbeat.js';
import { getNewsWindowEvent } from '../utils/newsCheck.js';

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

function resolveOmegaDirection(
  engineId: string,
  signalDirection: string,
  omegaDirection: string
): string {
  if (engineId !== 'omega') return signalDirection;
  if (omegaDirection.toLowerCase() === 'short') {
    return signalDirection === 'LONG' ? 'SHORT' : 'LONG';
  }
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
    const to = new Date(
      signalTimeMs + 5 * 60 * 1000 + 1000
    ).toISOString();

    const url =
      `${baseUrl}/v3/instruments/GBP_USD/candles` +
      `?granularity=M1&price=M` +
      `&from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}`;

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
        to,
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
        to,
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
  signalCreatedAt: string | null | undefined
): { blocked: boolean; reason: string | null } {
  if (engineId !== 'engine_rebuild') {
    return { blocked: false, reason: null };
  }

  // Hour gate — covers bad GBPUSD hours AND Asian session
  // Asian session (00-06 UTC) + known destructive hours
  const hourUtc = signalCreatedAt
    ? new Date(signalCreatedAt).getUTCHours()
    : new Date().getUTCHours();

  // Blocked hours — data validated from shadow signal analysis:
  // 0-7: Asian session + pre-London (structural underperformance)
  // 9: London open whipsaw
  // 10: confirmed negative -0.195R avg n=18
  // 14,15: London close dead zone
  // 19,20,21: late NY / Asian open — 0% TP confirmed
  const BLOCKED_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15, 19, 20, 21];
  if (BLOCKED_HOURS.includes(hourUtc)) {
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

export async function processSignal(
  payload: SignalInsertPayload,
  receivedAt: Date,
  deps: RouterDeps
): Promise<void> {
  const { config, engines, getCachedAccount, getOpenTradesFromLog, supabase } = deps;
  const signalId = (payload.id ?? '').toString();
  const staleAge = Date.now() - new Date((payload.created_at ?? 0).toString()).getTime();
  if (staleAge > config.staleSignalMaxAgeMs) {
    logWarn('Skipping stale signal', { signalId, engineId: payload.engine_id, ageMs: staleAge });
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'SKIPPED', `Stale signal (${staleAge}ms old)`, null, null, 0, undefined));
    return;
  }

  const validation = validateSignal(payload, config.defaultRiskReward);
  if (!validation.pass) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', validation.reason ?? 'Validation failed', null, null, 0, undefined));
    return;
  }
  const norm = validation.normalized!;
  const decisionLatencyMs = Date.now() - receivedAt.getTime();
  if (decisionLatencyMs > config.maxLatencyMs) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'SKIPPED', `Latency ${decisionLatencyMs}ms > ${config.maxLatencyMs}ms`, decisionLatencyMs, null, 0, norm.oandaInstrument));
    return;
  }

  // Live engine control — reads paused_engines, omega_direction, and
  // rebuild_bounds_retry fresh per signal from bridge_config.
  // Targeted reads — one per control key.
  // Falls back safely if rows missing or DB error.
  const [pausedRow, dirRow, boundsRetryRow] = await Promise.all([
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

  const engine = findEngine(engines, norm.engineId);
  if (!engine || !engine.is_active) {
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
    if (getConsecutiveLosses() >= config.maxConsecutiveLosses) enterCooldown(config.cooldownAfterLossesMinutes);
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
    payload.created_at as string | null
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
    engineThreshold: engine.execution_threshold,
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

  // News window logging — Omega and Rebuild only
  // Logs the news event context WITHOUT blocking execution
  // newsBlackoutEnabled in bridge_config controls this check
  // Shadow data continues accumulating for intelligence building
  const NEWS_TAGGED_ENGINES = ['omega', 'engine_rebuild'];
  if (config.newsBlackoutEnabled && NEWS_TAGGED_ENGINES.includes(norm.engineId)) {
    const newsEvent = await getNewsWindowEvent(norm.oandaInstrument);
    if (newsEvent) {
      logInfo('News window detected — signal will execute with tag', {
        signalId,
        engineId: norm.engineId,
        pair: norm.oandaInstrument,
        newsEvent,
      });
      // Tag: insert a log row noting news window context
      // Decision is NOTE not BLOCKED — trade still executes
      await supabase.from('bridge_trade_log').insert(
        buildTradeLogRow(
          payload,
          'EXECUTED',
          `NEWS_WINDOW: ${newsEvent}`,
          decisionLatencyMs,
          cachedAccount?.equity ?? null,
          openTrades.length,
          norm.oandaInstrument
        )
      );
    }
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

  const conversionRate = getConversionRateForInstrument(
    norm.oandaInstrument,
    getCachedConversionRates()
  );
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
  const units = norm.direction === 'LONG' ? unitCount : -unitCount;

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
  const finalUnits = norm.engineId === 'engine_rebuild'
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
          strong:   2.0,
          moderate: 1.0,
          weak:     0.75,
          against:  0.25,
          no_data:  0.5,
        };
        const multiplier =
          bar1Multipliers[bar1Data.strength] ?? 0.5;
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
          multiplier,
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
    // ── Omega SL mirror for trail stop sizing ──────────────────
    // When omega direction is inverted by resolveOmegaDirection,
    // norm.stopLoss stays as the original signal SL (wrong side).
    // bridge_trade_log.stop_loss feeds computeTrailInsertFields:
    //   rSizeRaw = Math.abs(fillPrice - stopLoss)
    // With wrong-side SL and fill near original SL → rSizeRaw≈0
    // → trail_distance≈0 → instant trail_sl_hit (Trade 1108: 12s)
    //
    // Fix: mirror SL to correct side of fill using signal rSize.
    // Covers both inversion directions:
    //   LONG signal → SHORT execution: mirroredSL above fill
    //   SHORT signal → LONG execution: mirroredSL below fill
    //
    // OANDA order unaffected — omega in TRAIL_STOP_ENGINES,
    // no stopLossPrice ever sent to OANDA for omega.
    // Position sizing unaffected — uses slPipsOverride from signal.
    // signalValidation unaffected — runs before direction mutation.
    if (norm.engineId === 'omega' && fillPrice != null) {
      const signalRSize = Math.abs(norm.entryPrice - norm.stopLoss);
      const mirroredSL = norm.direction === 'SHORT'
        ? fillPrice + signalRSize   // SHORT: SL above fill
        : fillPrice - signalRSize;  // LONG:  SL below fill
      (row as Record<string, unknown>).stop_loss = mirroredSL;
      console.log(
        '[Omega] SL mirrored for trail sizing',
        'direction=', norm.direction,
        'fill=', fillPrice,
        'signalRSize=', signalRSize,
        'mirroredSL=', mirroredSL.toFixed(5)
      );
    }
    // ── End Omega SL mirror ─────────────────────────────────────
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
