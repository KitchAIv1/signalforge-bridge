/**
 * Fan-out omega Trail v1 execution across all active broker routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { ActiveRegimeState } from '../RegimeStateService.js';
import type { ActiveAmdState } from '../amdDetector/amdStateService.js';
import { executeOmegaTrailV1Order } from '../../core/omegaTrailV1Execution.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import type { ValidationResult } from '../../core/signalValidation.js';
import type { DecisionType } from '../../types/signals.js';
import { loadExecutionRoutes } from './brokerLinkService.js';
import { scaleUnitsForBrokerRoute } from './routePositionSizer.js';

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

export async function executeOmegaOnAllBrokers(params: OmegaFanOutParams): Promise<void> {
  const routes = await loadExecutionRoutes(params.supabase, 'omega');
  const baseEquity = params.cachedAccountEquity ?? 0;

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

    await executeOmegaTrailV1Order({
      ...params,
      finalUnits: routeUnits,
      cachedAccountEquity: routeEquity,
      broker: route.broker,
      brokerId: route.brokerId,
    });
  }
}
