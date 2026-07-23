/**
 * Place / register helpers for Lane B crack entries after an rSize&lt;4 block.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import { calculateUnits } from '../positionSizer.js';
import { getConsecutiveLosses } from '../circuitBreaker.js';
import type { EngineBrokerRoute } from '../../services/broker/brokerLinkService.js';
import { scaleUnitsForBrokerRoute } from '../../services/broker/routePositionSizer.js';
import { executeOmegaTrailV1Order } from '../omegaTrailV1Execution.js';
import { logError, logInfo, logWarn } from '../../utils/logger.js';
import type { DecisionType } from '../../types/signals.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import type { ValidationResult } from '../signalValidation.js';
import { registerAlphaOmegaPosition } from './alphaOmegaPositionTracking.js';
import {
  readOmegaFireDirection,
  readOmegaFireTimestamp,
} from './alphaOmegaFireIdentity.js';
import {
  isAlphaOmegaPureSizingEnabled,
  sizeAlphaOmegaPureUnits,
  withPureSizingAdvisory,
} from './alphaOmegaPureSizer.js';

type NormalizedOmega = NonNullable<ValidationResult['normalized']>;

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

export interface PlaceLaneBCrackParams {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  config: BridgeConfig;
  engine: BridgeEngineRow;
  norm: NormalizedOmega;
  laneBRoute: EngineBrokerRoute;
  cachedAccountEquity: number | null;
  openTradeCount: number;
  decisionLatencyMs: number;
  foundingLength: number | null;
  foundingSpeedMin: number | null;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
}

async function resolveRouteEquity(
  route: EngineBrokerRoute,
  fallback: number,
): Promise<number> {
  try {
    return (await route.broker.getAccountSummary()).equity;
  } catch (err) {
    logWarn('[AlphaOmega] Lane B equity fetch failed on crack path', { error: String(err) });
    return fallback;
  }
}

function sizeLaneBUnitsLegacy(
  params: PlaceLaneBCrackParams,
  routeEquity: number,
): number {
  const baseUnits = calculateUnits({
    equity: routeEquity,
    engineWeight: params.engine.weight,
    riskPct: params.config.riskPerTradePct,
    entry: params.norm.entryPrice,
    stopLoss: params.norm.stopLoss,
    instrument: params.norm.oandaInstrument,
    consecutiveLosses: getConsecutiveLosses(),
    graduatedThreshold: params.config.graduatedResponseThreshold,
    confluenceScore: params.norm.confluenceScore,
  });
  const signedBase = params.norm.direction === 'LONG' ? baseUnits : -baseUnits;
  return scaleUnitsForBrokerRoute({
    baseUnits: signedBase,
    baseEquity: params.cachedAccountEquity ?? routeEquity,
    route: params.laneBRoute,
    routeEquity,
    engineWeight: params.engine.weight,
  });
}

export async function placeLaneBCrackOrder(params: PlaceLaneBCrackParams): Promise<void> {
  const routeEquity = await resolveRouteEquity(
    params.laneBRoute,
    params.cachedAccountEquity ?? 0,
  );
  const pureSizing = await isAlphaOmegaPureSizingEnabled(params.supabase);
  let routeUnits: number;
  let laneAdvisory =
    `ALPHAOMEGA_ENTRY:len=${params.foundingLength}:speed=${params.foundingSpeedMin?.toFixed(1)}m`;
  if (pureSizing) {
    routeUnits = sizeAlphaOmegaPureUnits({
      routeEquity,
      engineWeight: params.engine.weight,
      riskPct: params.config.riskPerTradePct,
      entry: params.norm.entryPrice,
      stopLoss: params.norm.stopLoss,
      instrument: params.norm.oandaInstrument,
      direction: params.norm.direction,
      capitalAllocationPct: params.laneBRoute.capitalAllocationPct,
      slPipsOverride: params.norm.slPipsFromSignal ?? undefined,
    });
    laneAdvisory = withPureSizingAdvisory(laneAdvisory);
  } else {
    routeUnits = sizeLaneBUnitsLegacy(params, routeEquity);
  }
  logInfo('[AlphaOmega] Lane B crack entry despite rSize<4 shared gate', {
    signalId: params.signalId,
    foundingLength: params.foundingLength,
    foundingSpeedMin: params.foundingSpeedMin,
    pureSizing,
    routeUnits,
  });
  await executeCrackOrder(params, routeEquity, routeUnits, laneAdvisory);
}

async function executeCrackOrder(
  params: PlaceLaneBCrackParams,
  routeEquity: number,
  routeUnits: number,
  laneAdvisory: string,
): Promise<void> {
  try {
    await executeOmegaTrailV1Order({
      supabase: params.supabase,
      payload: params.payload,
      norm: params.norm,
      finalUnits: routeUnits,
      signalId: params.signalId,
      config: params.config,
      engine: params.engine,
      decisionLatencyMs: params.decisionLatencyMs,
      cachedAccountEquity: routeEquity,
      openTradeCount: params.openTradeCount,
      regimeState: null,
      regimeSizeMultiplier: 1,
      amdState: null,
      directionMode: 'raw',
      buildTradeLogRow: params.buildTradeLogRow,
      attachOmegaAuditFields: params.attachOmegaAuditFields,
      broker: params.laneBRoute.broker,
      brokerId: params.laneBRoute.brokerId,
      laneAdvisory,
    });
    await registerFillIfPresent(
      params.supabase,
      params.payload,
      params.signalId,
      params.laneBRoute.brokerId,
    );
  } catch (err) {
    logError('[AlphaOmega] Lane B crack order failed', {
      signalId: params.signalId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function registerFillIfPresent(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
  signalId: string,
  brokerId: string,
): Promise<void> {
  const { data } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, fill_price')
    .eq('signal_id', signalId)
    .eq('broker_id', brokerId)
    .not('oanda_trade_id', 'is', null)
    .maybeSingle();
  if (!data?.oanda_trade_id) return;
  const direction = readOmegaFireDirection(payload);
  if (!direction) return;
  await registerAlphaOmegaPosition(supabase, {
    oandaTradeId: String(data.oanda_trade_id),
    brokerId,
    direction,
    entryFiredAt: readOmegaFireTimestamp(payload),
    entryPrice: data.fill_price != null ? Number(data.fill_price) : null,
  });
}
