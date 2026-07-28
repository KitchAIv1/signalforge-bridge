/**
 * Handle ao_shadow_over signals — Shadow streak/paper only. Never Trail / Lane B.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { DecisionType } from '../../types/signals.js';
import { logInfo } from '../../utils/logger.js';
import { ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON } from './alphaOmegaConstants.js';
import { observeAlphaOmegaShadowFire } from './alphaOmegaShadowFireObserver.js';

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

export interface HandleAoShadowOverArgs {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  receivedAt: Date;
  cachedAccountEquity: number | null;
  buildTradeLogRow: TradeLogBuilder;
}

export async function handleAoShadowOverSignal(
  args: HandleAoShadowOverArgs,
): Promise<void> {
  const result = await observeAlphaOmegaShadowFire(args.supabase, args.payload, {
    source: 'over_threshold',
  });
  const decisionLatencyMs = Date.now() - args.receivedAt.getTime();

  await args.supabase.from('bridge_trade_log').insert(
    args.buildTradeLogRow(
      args.payload,
      'SKIPPED',
      ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON,
      decisionLatencyMs,
      args.cachedAccountEquity,
      0,
      undefined,
    ),
  );

  logInfo('[AlphaOmegaShadow] over-threshold fire handled', {
    signalId: args.signalId,
    observed: result.observed,
    crack: result.crackEvent != null,
    paperEntered: result.paperEntered,
  });
}
