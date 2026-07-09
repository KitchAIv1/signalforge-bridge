/**
 * Fan-out omega Trail v1 execution across all active broker routes.
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
import {
  ALPHAOMEGA_ENABLED_CONFIG_KEY,
  isOmegaLaneBBroker,
} from '../../core/alphaOmega/alphaOmegaConstants.js';
import { evaluateAlphaOmegaEntryGate } from '../../core/alphaOmega/alphaOmegaEntryGate.js';
import {
  recordFireAndDetectCrack,
  type AlphaOmegaDirection,
  type CrackEvent,
} from '../../core/alphaOmega/alphaOmegaStreakTracker.js';
import { registerAlphaOmegaPosition, trackFireAgainstOpenPositions } from '../../core/alphaOmega/alphaOmegaPositionTracking.js';

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

async function isAlphaOmegaEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return true; // default enabled per rollout decision
  return data.config_value === true || data.config_value === 'true';
}

function normalizeAlphaOmegaDirection(raw: string): AlphaOmegaDirection | null {
  const upper = raw.toUpperCase();
  return upper === 'LONG' || upper === 'SHORT' ? upper : null;
}

interface AlphaOmegaFireOutcome {
  crackEvent: CrackEvent | null;
  /** False if a Lane B position closed THIS fire for a non-backstop reason
   * (opposing_count / opposing_share). Mirrors the validated batch backtest:
   * only a backstop_crack close legitimately chains into an immediate new
   * entry on the same fire — any other close must wait for a later crack,
   * even if this fire coincidentally also looks like a qualifying one. */
  entryEligibleThisFire: boolean;
}

/**
 * Updates the ALPHAOMEGA streak tracker + open-Lane-B-position tracking ONCE
 * per incoming omega signal (not per broker route) — the underlying fire
 * stream is broker-agnostic. Wrapped so any failure here NEVER blocks Lane A
 * or any other broker route's normal execution.
 */
async function updateAlphaOmegaStreakState(params: OmegaFanOutParams): Promise<AlphaOmegaFireOutcome> {
  try {
    const direction = normalizeAlphaOmegaDirection(params.norm.direction);
    if (!direction) return { crackEvent: null, entryEligibleThisFire: true };
    const firedAt = String(params.payload.created_at ?? new Date().toISOString());
    const crackEvent = await recordFireAndDetectCrack(params.supabase, {
      direction,
      firedAt,
      signalId: params.signalId,
    });
    const tracking = await trackFireAgainstOpenPositions(params.supabase, { direction, firedAt, signalId: params.signalId }, crackEvent);
    return { crackEvent, entryEligibleThisFire: !tracking.closedForOtherReason };
  } catch (err) {
    logWarn('[AlphaOmega] streak state update failed — continuing without crack info', {
      signalId: params.signalId,
      error: String(err),
    });
    return { crackEvent: null, entryEligibleThisFire: true };
  }
}

/** Looks up the trade just opened by executeOmegaTrailV1Order for this route (it does not return one). */
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
  const alphaOmegaOutcome = alphaOmegaEnabled
    ? await updateAlphaOmegaStreakState(params)
    : { crackEvent: null as CrackEvent | null, entryEligibleThisFire: true };
  const crackEvent = alphaOmegaOutcome.entryEligibleThisFire ? alphaOmegaOutcome.crackEvent : null;

  for (const route of routes) {
    if (await hasOpenOmegaOnBroker(params.supabase, route.brokerId)) {
      logInfo('[Omega] Skipping broker — open omega trade on route', {
        brokerId: route.brokerId,
        signalId: params.signalId,
      });
      continue;
    }

    let routeEquity = baseEquity;
    try {
      const summary = await route.broker.getAccountSummary();
      routeEquity = summary.equity;
    } catch (err) {
      logWarn('[Omega] Broker equity fetch failed — using cached equity', {
        brokerId: route.brokerId,
        error: String(err),
      });
    }

    const routeUnits = scaleUnitsForBrokerRoute({
      baseUnits: params.finalUnits,
      baseEquity,
      route,
      routeEquity,
      engineWeight: params.engine.weight,
    });

    let laneAdvisory: string | null = null;
    const isLaneB = isOmegaLaneBBroker(route.brokerId);
    if (isLaneB && alphaOmegaEnabled) {
      const direction = normalizeAlphaOmegaDirection(params.norm.direction);
      const gate = evaluateAlphaOmegaEntryGate({
        crackEvent,
        direction: direction ?? 'LONG',
        hasOpenPosition: false, // guaranteed by the hasOpenOmegaOnBroker check above this loop iteration
      });
      if (!direction || !gate.enter) {
        await insertLaneBBlockedRow({
          supabase: params.supabase,
          payload: params.payload,
          signalId: params.signalId,
          brokerId: route.brokerId,
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
        continue;
      }
      laneAdvisory = `ALPHAOMEGA_ENTRY:len=${gate.foundingLength}:speed=${gate.foundingSpeedMin?.toFixed(1)}m`;
    } else if (isLaneB) {
      // Kill switch off — legacy Lane B behavior: enter unfiltered on any signal (no R1/Phase2, no ALPHAOMEGA gate).
      laneAdvisory = 'ALPHAOMEGA_DISABLED_FALLBACK';
    }

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
        const filled = await findJustFilledTrade(params.supabase, params.signalId, route.brokerId);
        if (filled) {
          const direction = normalizeAlphaOmegaDirection(params.norm.direction);
          if (direction) {
            await registerAlphaOmegaPosition(params.supabase, {
              oandaTradeId: filled.oandaTradeId,
              direction,
              entryFiredAt: String(params.payload.created_at ?? new Date().toISOString()),
              entryPrice: filled.fillPrice,
            });
          }
        }
      }
    } catch (routeErr) {
      logError('[Omega] Broker route failed — continuing other routes', {
        brokerId: route.brokerId,
        signalId: params.signalId,
        error: routeErr instanceof Error ? routeErr.message : String(routeErr),
      });
    }
  }
}
