/**
 * Fan-out omega Trail v1 execution across all active broker routes.
 * ALPHAOMEGA streak counting happens earlier in processSignal via
 * observeAlphaOmegaFire — pass alphaOmegaFireOutcome to avoid double-count.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { ActiveRegimeState } from '../RegimeStateService.js';
import type { ActiveAmdState } from '../amdDetector/amdStateService.js';
import { executeOmegaTrailV1Order } from '../../core/omegaTrailV1Execution.js';
import { logError, logInfo, logWarn } from '../../utils/logger.js';
import type { ValidationResult } from '../../core/signalValidation.js';
import type { DecisionType } from '../../types/signals.js';
import { loadExecutionRoutes } from './brokerLinkService.js';
import { scaleUnitsForBrokerRoute } from './routePositionSizer.js';
import { insertLaneBBlockedRow } from '../../core/omegaLaneB/omegaLaneBBlockedRow.js';
import { isOmegaLaneBBroker } from '../../core/alphaOmega/alphaOmegaConstants.js';
import { evaluateAlphaOmegaEntryGate } from '../../core/alphaOmega/alphaOmegaEntryGate.js';
import type { AlphaOmegaDirection } from '../../core/alphaOmega/alphaOmegaStreakTracker.js';
import { registerAlphaOmegaPosition } from '../../core/alphaOmega/alphaOmegaPositionTracking.js';
import {
  crackForEntry,
  isAlphaOmegaEnabled,
  observeAlphaOmegaFire,
  type AlphaOmegaFireOutcome,
  EMPTY_ALPHAOMEGA_FIRE_OUTCOME,
} from '../../core/alphaOmega/alphaOmegaFireObserver.js';
import {
  isAlphaOmegaEntryAdvisory,
  isAlphaOmegaPureSizingEnabled,
  sizeAlphaOmegaPureUnits,
  withPureSizingAdvisory,
} from '../../core/alphaOmega/alphaOmegaPureSizer.js';
import {
  isOmegaRawPureSizingEnabled,
  sizeOmegaRawPureUnits,
} from '../../core/omegaRawPolicy/omegaRawPureSizer.js';

type RouterNormalizedSignal = NonNullable<ValidationResult['normalized']>;

type TradeLogBuilder = (
  payload: SignalInsertPayload,
  decision: DecisionType,
  blockReason: string | null,
  decisionLatencyMs: number,
  equity: number | null,
  openTradeCount: number,
  instrument: string,
  direction?: string,
) => Record<string, unknown>;

type AuditAttacher = (
  row: Record<string, unknown>,
  regimeState: ActiveRegimeState | null,
  regimeSizeMultiplier: number,
  amdState: ActiveAmdState | null,
  directionMode: string,
) => void;

export interface OmegaFanOutParams {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  norm: RouterNormalizedSignal;
  finalUnits: number;
  signalId: string;
  config: BridgeConfig;
  engine: BridgeEngineRow;
  decisionLatencyMs: number;
  cachedAccountEquity: number | null;
  openTradeCount: number;
  regimeState: ActiveRegimeState | null;
  regimeSizeMultiplier: number;
  amdState: ActiveAmdState | null;
  directionMode: string;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
  /** Precomputed by processSignal (preferred). If omitted, observes here (legacy). */
  alphaOmegaFireOutcome?: AlphaOmegaFireOutcome;
}

async function hasOpenOmegaOnBroker(
  supabase: SupabaseClient,
  brokerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('id')
    .eq('engine_id', 'omega')
    .eq('status', 'open')
    .eq('broker_id', brokerId)
    .not('oanda_trade_id', 'is', null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

function normalizeAlphaOmegaDirection(raw: string): AlphaOmegaDirection | null {
  const upper = raw.toUpperCase();
  return upper === 'LONG' || upper === 'SHORT' ? upper : null;
}

async function resolveFireOutcome(params: OmegaFanOutParams): Promise<AlphaOmegaFireOutcome> {
  if (params.alphaOmegaFireOutcome) return params.alphaOmegaFireOutcome;
  if (!(await isAlphaOmegaEnabled(params.supabase))) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  return observeAlphaOmegaFire(params.supabase, params.payload);
}

async function findJustFilledTrade(
  supabase: SupabaseClient,
  signalId: string,
  brokerId: string,
): Promise<{ oandaTradeId: string; fillPrice: number | null } | null> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, fill_price')
    .eq('signal_id', signalId)
    .eq('broker_id', brokerId)
    .not('oanda_trade_id', 'is', null)
    .maybeSingle();
  if (!data?.oanda_trade_id) return null;
  return {
    oandaTradeId: String(data.oanda_trade_id),
    fillPrice: data.fill_price != null ? Number(data.fill_price) : null,
  };
}

export async function executeOmegaOnAllBrokers(params: OmegaFanOutParams): Promise<void> {
  const routes = await loadExecutionRoutes(params.supabase, 'omega');
  const baseEquity = params.cachedAccountEquity ?? 0;
  const alphaOmegaEnabled = await isAlphaOmegaEnabled(params.supabase);
  const aoPureSizingEnabled =
    alphaOmegaEnabled && (await isAlphaOmegaPureSizingEnabled(params.supabase));
  const omegaRawPureSizing = await isOmegaRawPureSizingEnabled(params.supabase);
  const fireOutcome = alphaOmegaEnabled
    ? await resolveFireOutcome(params)
    : EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  const crackEvent = crackForEntry(fireOutcome);

  for (const route of routes) {
    await processOneBrokerRoute(
      params,
      route,
      baseEquity,
      alphaOmegaEnabled,
      aoPureSizingEnabled,
      omegaRawPureSizing,
      crackEvent,
    );
  }
}

async function fetchRouteEquity(
  route: Awaited<ReturnType<typeof loadExecutionRoutes>>[number],
  baseEquity: number,
): Promise<number> {
  try {
    return (await route.broker.getAccountSummary()).equity;
  } catch (err) {
    logWarn('[Omega] Broker equity fetch failed — using cached equity', {
      brokerId: route.brokerId,
      error: String(err),
    });
    return baseEquity;
  }
}

async function processOneBrokerRoute(
  params: OmegaFanOutParams,
  route: Awaited<ReturnType<typeof loadExecutionRoutes>>[number],
  baseEquity: number,
  alphaOmegaEnabled: boolean,
  aoPureSizingEnabled: boolean,
  omegaRawPureSizing: boolean,
  crackEvent: ReturnType<typeof crackForEntry>,
): Promise<void> {
  if (await hasOpenOmegaOnBroker(params.supabase, route.brokerId)) {
    logInfo('[Omega] Skipping broker — open omega trade on route', {
      brokerId: route.brokerId,
      signalId: params.signalId,
    });
    return;
  }

  const routeEquity = await fetchRouteEquity(route, baseEquity);
  let routeUnits = scaleUnitsForBrokerRoute({
    baseUnits: params.finalUnits,
    baseEquity,
    route,
    routeEquity,
    engineWeight: params.engine.weight,
  });
  const isLaneB = isOmegaLaneBBroker(route.brokerId);
  let laneAdvisory = await resolveLaneAdvisory(
    params,
    isLaneB,
    alphaOmegaEnabled,
    crackEvent,
    route.brokerId,
    routeEquity,
  );
  if (laneAdvisory === 'BLOCKED_SKIP') return;

  if (
    aoPureSizingEnabled &&
    laneAdvisory != null &&
    isAlphaOmegaEntryAdvisory(laneAdvisory)
  ) {
    const inheritedUnits = routeUnits;
    routeUnits = sizeAlphaOmegaPureUnits({
      routeEquity,
      engineWeight: params.engine.weight,
      riskPct: params.config.riskPerTradePct,
      entry: params.norm.entryPrice,
      stopLoss: params.norm.stopLoss,
      instrument: params.norm.oandaInstrument,
      direction: params.norm.direction,
      capitalAllocationPct: route.capitalAllocationPct,
      slPipsOverride: params.norm.slPipsFromSignal ?? undefined,
    });
    laneAdvisory = withPureSizingAdvisory(laneAdvisory);
    logInfo('[AlphaOmega] Pure sizing applied (Lane B AO entry)', {
      signalId: params.signalId,
      brokerId: route.brokerId,
      inheritedUnits,
      pureUnits: routeUnits,
      routeEquity,
    });
  } else if (omegaRawPureSizing && !isAlphaOmegaEntryAdvisory(laneAdvisory)) {
    const inheritedUnits = routeUnits;
    routeUnits = sizeOmegaRawPureUnits({
      equity: routeEquity,
      engineWeight: params.engine.weight,
      riskPct: params.config.riskPerTradePct,
      entry: params.norm.entryPrice,
      stopLoss: params.norm.stopLoss,
      instrument: params.norm.oandaInstrument,
      direction: params.norm.direction,
      capitalAllocationPct: route.capitalAllocationPct,
      slPipsOverride: params.norm.slPipsFromSignal ?? undefined,
    });
    logInfo('[OmegaRaw] Pure sizing applied (route)', {
      signalId: params.signalId,
      brokerId: route.brokerId,
      inheritedUnits,
      pureUnits: routeUnits,
      routeEquity,
    });
  }

  await placeRouteOrder(params, route, routeEquity, routeUnits, isLaneB, alphaOmegaEnabled, laneAdvisory);
}

async function placeRouteOrder(
  params: OmegaFanOutParams,
  route: Awaited<ReturnType<typeof loadExecutionRoutes>>[number],
  routeEquity: number,
  routeUnits: number,
  isLaneB: boolean,
  alphaOmegaEnabled: boolean,
  laneAdvisory: string | null,
): Promise<void> {
  try {
    await executeOmegaTrailV1Order({
      ...params,
      finalUnits: routeUnits,
      cachedAccountEquity: routeEquity,
      broker: route.broker,
      brokerId: route.brokerId,
      laneAdvisory,
    });
    if (isLaneB && alphaOmegaEnabled) {
      await registerLaneBFill(params, route.brokerId);
    }
  } catch (routeErr) {
    logError('[Omega] Broker route failed — continuing other routes', {
      brokerId: route.brokerId,
      signalId: params.signalId,
      error: routeErr instanceof Error ? routeErr.message : String(routeErr),
    });
  }
}

async function resolveLaneAdvisory(
  params: OmegaFanOutParams,
  isLaneB: boolean,
  alphaOmegaEnabled: boolean,
  crackEvent: ReturnType<typeof crackForEntry>,
  brokerId: string,
  routeEquity: number,
): Promise<string | null | 'BLOCKED_SKIP'> {
  if (!isLaneB) return null;
  if (!alphaOmegaEnabled) return 'ALPHAOMEGA_DISABLED_FALLBACK';

  const direction = normalizeAlphaOmegaDirection(params.norm.direction);
  const gate = evaluateAlphaOmegaEntryGate({
    crackEvent,
    direction: direction ?? 'LONG',
    hasOpenPosition: false,
  });
  if (!direction || !gate.enter) {
    await insertLaneBBlockedRow({
      supabase: params.supabase,
      payload: params.payload,
      signalId: params.signalId,
      brokerId,
      blockReason: gate.blockReason ?? 'ALPHAOMEGA_INVALID_DIRECTION',
      decisionLatencyMs: params.decisionLatencyMs,
      routeEquity,
      openTradeCount: params.openTradeCount,
      instrument: params.norm.oandaInstrument,
      direction: params.norm.direction,
      regimeState: params.regimeState,
      regimeSizeMultiplier: params.regimeSizeMultiplier,
      amdState: params.amdState,
      directionMode: params.directionMode,
      buildTradeLogRow: params.buildTradeLogRow,
      attachOmegaAuditFields: params.attachOmegaAuditFields,
      shadowAdvisory: gate.shadowAdvisory,
    });
    return 'BLOCKED_SKIP';
  }
  return `ALPHAOMEGA_ENTRY:len=${gate.foundingLength}:speed=${gate.foundingSpeedMin?.toFixed(1)}m`;
}

async function registerLaneBFill(params: OmegaFanOutParams, brokerId: string): Promise<void> {
  const filled = await findJustFilledTrade(params.supabase, params.signalId, brokerId);
  if (!filled) return;
  const direction = normalizeAlphaOmegaDirection(params.norm.direction);
  if (!direction) return;
  await registerAlphaOmegaPosition(params.supabase, {
    oandaTradeId: filled.oandaTradeId,
    direction,
    entryFiredAt: String(params.payload.created_at ?? new Date().toISOString()),
    entryPrice: filled.fillPrice,
  });
}
