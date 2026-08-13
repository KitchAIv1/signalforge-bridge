/**
 * AO-observe-only signals: matched Omega fires suppressed from Trail by
 * engine-omega bridge exec-dedup (15m after any omega EXECUTED).
 * Live streak / crack must not count these beeps. Shadow AO may still observe.
 * Never Trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import type { DecisionType } from '../../types/signals.js';
import { logInfo } from '../../utils/logger.js';
import { ALPHAOMEGA_OBSERVE_DEDUPED_REASON } from './alphaOmegaConstants.js';
import { observeAlphaOmegaShadowFire } from './alphaOmegaShadowFireObserver.js';
import {
  isAoObserveOnlyPayload,
  readSignalExecutionTier,
} from './alphaOmegaExecutionTier.js';

export { isAoObserveOnlyPayload, readSignalExecutionTier };

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
 * Log the exec-dedup beep; do not feed live AO streak or Lane B crack.
 * Shadow AO remains isolated and may still count the fire.
 */
export async function handleAoObserveOnlySignal(
  args: HandleAoObserveOnlyArgs,
): Promise<void> {
  await observeAlphaOmegaShadowFire(args.supabase, args.payload, {
    source: 'matched',
  });
  const decisionLatencyMs = Date.now() - args.receivedAt.getTime();
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
  logInfo('[AlphaOmega] Observe-only fire ignored for live streak', {
    signalId: args.signalId,
  });
}
