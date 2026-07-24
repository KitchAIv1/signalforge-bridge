/**
 * AO-observe-only signals: matched Omega fires suppressed from Trail by
 * engine-omega bridge exec-dedup (15m after any omega EXECUTED).
 * Counts toward streak / opposing / backstop; may Lane-B crack-enter; never Trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import type { DecisionType } from '../../types/signals.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_OBSERVE_DEDUPED_REASON,
  ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
} from './alphaOmegaConstants.js';
import { observeAlphaOmegaFire } from './alphaOmegaFireObserver.js';
import { isOmegaEnginePayload } from './alphaOmegaFireIdentity.js';
import { maybeEnterLaneBOnCrack } from './alphaOmegaLaneBCrackEntry.js';

type TradeLogBuilder = (
  payload: SignalInsertPayload,
  decision: DecisionType,
  blockReason: string | null,
  decisionLatencyMs: number | null,
  equity: number | null,
  openCount: number,
  oandaPair?: string,
  directionOverride?: string,
) => Record<string, unknown>;

type AuditAttacher = (
  row: Record<string, unknown>,
  regimeState: ActiveRegimeState | null,
  regimeSizeMultiplier: number,
  amdState: ActiveAmdState | null,
  directionMode: string,
) => void;

const noopAuditAttach: AuditAttacher = () => undefined;

export function readSignalExecutionTier(
  payload: SignalInsertPayload,
): string | null {
  const raw = (payload as Record<string, unknown>).execution_tier;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toLowerCase();
}

/** True when engine-omega wrote an exec-dedup observe-only row. */
export function isAoObserveOnlyPayload(payload: SignalInsertPayload): boolean {
  return (
    isOmegaEnginePayload(payload) &&
    readSignalExecutionTier(payload) === ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER
  );
}

export interface HandleAoObserveOnlyArgs {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  config: BridgeConfig;
  engines: BridgeEngineRow[];
  receivedAt: Date;
  cachedAccountEquity: number | null;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields?: AuditAttacher;
}

/**
 * Observe fire into AO streak/position tracking; optional Lane B crack entry.
 * Never runs Omega Trail / multi-broker RAW fan-out.
 */
export async function handleAoObserveOnlySignal(
  args: HandleAoObserveOnlyArgs,
): Promise<void> {
  const fireOutcome = await observeAlphaOmegaFire(args.supabase, args.payload);
  const engine = args.engines.find((row) => row.engine_id === 'omega');
  const decisionLatencyMs = Date.now() - args.receivedAt.getTime();

  let crackEntered = false;
  try {
    crackEntered = await maybeEnterLaneBOnCrack({
      supabase: args.supabase,
      payload: args.payload,
      signalId: args.signalId,
      config: args.config,
      engine,
      fireOutcome,
      decisionLatencyMs,
      cachedAccountEquity: args.cachedAccountEquity,
      openTradeCount: 0,
      buildTradeLogRow: args.buildTradeLogRow as never,
      attachOmegaAuditFields: args.attachOmegaAuditFields ?? noopAuditAttach,
    });
  } catch (err) {
    logWarn('[AlphaOmega] observe-only Lane B crack failed — streak kept', {
      signalId: args.signalId,
      error: String(err),
    });
  }

  await args.supabase.from('bridge_trade_log').insert(
    args.buildTradeLogRow(
      args.payload,
      'SKIPPED',
      ALPHAOMEGA_OBSERVE_DEDUPED_REASON,
      decisionLatencyMs,
      args.cachedAccountEquity,
      0,
      undefined,
    ),
  );

  logInfo('[AlphaOmega] Observe-only exec-dedup fire handled', {
    signalId: args.signalId,
    observed: fireOutcome.observed,
    crack: fireOutcome.crackEvent != null,
    crackEntered,
  });
}
