/**
 * Lane B–only crack entry when the shared 4-pip validateSignal block would
 * otherwise abort the entire router before fan-out. Streak already observed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import { loadExecutionRoutes } from '../../services/broker/brokerLinkService.js';
import { insertLaneBBlockedRow } from '../omegaLaneB/omegaLaneBBlockedRow.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import type { DecisionType } from '../../types/signals.js';
import { evaluateAlphaOmegaEntryGate } from './alphaOmegaEntryGate.js';
import { isOmegaLaneBBroker } from './alphaOmegaConstants.js';
import { normalizeOmegaForAlphaOmegaEntry } from './normalizeOmegaForAlphaOmega.js';
import {
  crackForEntry,
  type AlphaOmegaFireOutcome,
} from './alphaOmegaFireObserver.js';
import { readOmegaFireDirection } from './alphaOmegaFireIdentity.js';
import { placeLaneBCrackOrder } from './alphaOmegaLaneBCrackPlace.js';
import type { CrackEvent } from './alphaOmegaStreakTracker.js';
import type { EngineBrokerRoute } from '../../services/broker/brokerLinkService.js';

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

export interface AlphaOmegaLaneBCrackEntryParams {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  config: BridgeConfig;
  engine: BridgeEngineRow | undefined;
  fireOutcome: AlphaOmegaFireOutcome;
  decisionLatencyMs: number;
  cachedAccountEquity: number | null;
  openTradeCount: number;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
}

function isOmegaRSizeBlock(reason: string | null | undefined): boolean {
  return (reason ?? '').includes('rSize below 4-pip');
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

async function blockLaneBNoEnter(
  params: AlphaOmegaLaneBCrackEntryParams,
  brokerId: string,
  instrument: string,
  direction: string,
  gate: ReturnType<typeof evaluateAlphaOmegaEntryGate>,
): Promise<void> {
  await insertLaneBBlockedRow({
    supabase: params.supabase,
    payload: params.payload,
    signalId: params.signalId,
    brokerId,
    blockReason: gate.blockReason ?? 'ALPHAOMEGA_NO_QUALIFYING_CRACK',
    decisionLatencyMs: params.decisionLatencyMs,
    routeEquity: params.cachedAccountEquity,
    openTradeCount: params.openTradeCount,
    instrument,
    direction,
    regimeState: null,
    regimeSizeMultiplier: 1,
    amdState: null,
    directionMode: 'raw',
    buildTradeLogRow: params.buildTradeLogRow,
    attachOmegaAuditFields: params.attachOmegaAuditFields,
    shadowAdvisory: gate.shadowAdvisory,
  });
}

async function attemptLaneBCrack(
  params: AlphaOmegaLaneBCrackEntryParams,
  crackEvent: CrackEvent,
): Promise<boolean> {
  const norm = normalizeOmegaForAlphaOmegaEntry(params.payload, params.config.defaultRiskReward);
  const direction = readOmegaFireDirection(params.payload);
  if (!norm || !direction || !params.engine) {
    logWarn('[AlphaOmega] crack on rSize<4 but cannot normalize for Lane B', {
      signalId: params.signalId,
    });
    return false;
  }

  const routes = await loadExecutionRoutes(params.supabase, 'omega');
  const aoRoutes = routes.filter((route) => isOmegaLaneBBroker(route.brokerId));
  if (aoRoutes.length === 0) return false;

  const gate = evaluateAlphaOmegaEntryGate({
    crackEvent,
    direction,
    hasOpenPosition: false,
  });

  const fanOutStartedAt = Date.now();
  logInfo('[AlphaOmega] Lane B crack fan-out start', {
    signalId: params.signalId,
    routeOrder: aoRoutes.map((route) => route.brokerId),
  });

  let handled = false;
  for (const laneBRoute of aoRoutes) {
    handled =
      (await placeOrSkipLaneBRoute({
        params,
        laneBRoute,
        gate,
        norm,
        direction,
        fanOutStartedAt,
      })) || handled;
  }

  logInfo('[AlphaOmega] Lane B crack fan-out done', {
    signalId: params.signalId,
    totalFanOutMs: Date.now() - fanOutStartedAt,
  });
  return handled;
}

async function placeOrSkipLaneBRoute(input: {
  params: AlphaOmegaLaneBCrackEntryParams;
  laneBRoute: EngineBrokerRoute;
  gate: ReturnType<typeof evaluateAlphaOmegaEntryGate>;
  norm: NonNullable<ReturnType<typeof normalizeOmegaForAlphaOmegaEntry>>;
  direction: string;
  fanOutStartedAt: number;
}): Promise<boolean> {
  const { params, laneBRoute, gate, norm, fanOutStartedAt } = input;
  if (await hasOpenOmegaOnBroker(params.supabase, laneBRoute.brokerId)) {
    return true;
  }
  if (!gate.enter) {
    await blockLaneBNoEnter(
      params,
      laneBRoute.brokerId,
      norm.oandaInstrument,
      norm.direction,
      gate,
    );
    return true;
  }
  if (!params.engine) return false;

  const routeStartedAt = Date.now();
  const queuedBehindMs = routeStartedAt - fanOutStartedAt;
  logInfo('[AlphaOmega] Lane B crack place start', {
    signalId: params.signalId,
    brokerId: laneBRoute.brokerId,
    queuedBehindMs,
  });
  await placeLaneBCrackOrder({
    ...params,
    engine: params.engine,
    norm,
    laneBRoute,
    foundingLength: gate.foundingLength,
    foundingSpeedMin: gate.foundingSpeedMin,
  });
  logInfo('[AlphaOmega] Lane B crack place done', {
    signalId: params.signalId,
    brokerId: laneBRoute.brokerId,
    queuedBehindMs,
    placeElapsedMs: Date.now() - routeStartedAt,
    sinceFanOutStartMs: Date.now() - fanOutStartedAt,
  });
  return true;
}

/**
 * If this fire is an entry-eligible crack, place Lane B AO only (no Trail).
 * Used by rSize<4 side-path and by exec-dedup observe-only signals.
 */
export async function maybeEnterLaneBOnCrack(
  params: AlphaOmegaLaneBCrackEntryParams,
): Promise<boolean> {
  const crackEvent = crackForEntry(params.fireOutcome);
  if (!crackEvent || !params.engine) return false;
  return attemptLaneBCrack(params, crackEvent);
}

/**
 * If validation failed on Omega 4-pip floor AND this fire is an entry-eligible
 * crack, place Lane B only. Returns true when the rSize path was handled.
 */
export async function maybeEnterLaneBOnRSizeBlockedCrack(
  params: AlphaOmegaLaneBCrackEntryParams,
  validationReason: string | null | undefined,
): Promise<boolean> {
  if (!isOmegaRSizeBlock(validationReason)) return false;
  return maybeEnterLaneBOnCrack(params);
}
