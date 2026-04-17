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
import { placeMarketOrder } from '../connectors/oanda.js';
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
  signalDirection: string
): string {
  if (engineId !== 'omega') return signalDirection;
  const override = (
    process.env.OMEGA_DIRECTION_OVERRIDE ?? 'long'
  ).toLowerCase();
  if (override === 'short') {
    return signalDirection === 'LONG' ? 'SHORT' : 'LONG';
  }
  return signalDirection;
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

  const engine = findEngine(engines, norm.engineId);
  if (!engine || !engine.is_active) {
    await supabase.from('bridge_trade_log').insert(buildTradeLogRow(payload, 'BLOCKED', engine ? 'Engine inactive' : 'Unregistered engine', decisionLatencyMs, null, 0, norm.oandaInstrument));
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
    norm.direction
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

  try {
    const TRAIL_STOP_ENGINES = [
      'charlie', 'charlie_shadow', 'omega',
    ];
    const useTrailStop = TRAIL_STOP_ENGINES.includes(norm.engineId);

    const orderResult = await placeMarketOrder({
      instrument: norm.oandaInstrument,
      units,
      ...(useTrailStop
        ? {}
        : {
            stopLossPrice: norm.stopLoss.toFixed(
              norm.oandaInstrument.includes('JPY') ? 3 : 5
            ),
            takeProfitPrice: norm.takeProfit.toFixed(
              norm.oandaInstrument.includes('JPY') ? 3 : 5
            ),
          }),
    }, config.maxOrderTimeoutMs);
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
    await supabase.from('bridge_trade_log').insert(row);
    const { data: eng } = await supabase.from('bridge_engines').select('trades_today').eq('engine_id', norm.engineId).single();
    const newCount = ((eng as { trades_today?: number } | null)?.trades_today ?? engine.trades_today) + 1;
    await supabase.from('bridge_engines').update({ trades_today: newCount, updated_at: new Date().toISOString() }).eq('engine_id', norm.engineId);
    logInfo('Trade executed', { signalId, engineId: norm.engineId, pair: norm.oandaInstrument, units, tradeId });
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
