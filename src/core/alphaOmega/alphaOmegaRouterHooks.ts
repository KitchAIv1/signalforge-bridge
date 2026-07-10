/**
 * Early ALPHAOMEGA observe + optional Lane B crack fill when shared 4-pip
 * validation blocks. Keeps processSignal thin (legacy 1100+ line file).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { BridgeConfig, BridgeEngineRow } from '../../types/config.js';
import type { DecisionType } from '../../types/signals.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import {
  observeAlphaOmegaFire,
  type AlphaOmegaFireOutcome,
  EMPTY_ALPHAOMEGA_FIRE_OUTCOME,
} from './alphaOmegaFireObserver.js';
import { isOmegaEnginePayload } from './alphaOmegaFireIdentity.js';
import { maybeEnterLaneBOnRSizeBlockedCrack } from './alphaOmegaLaneBCrackEntry.js';

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

export interface OmegaValidationFailureArgs {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  config: BridgeConfig;
  engines: BridgeEngineRow[];
  fireOutcome: AlphaOmegaFireOutcome;
  validationReason: string;
  decisionLatencyMs: number;
  cachedAccountEquity: number | null;
  openTradeCount: number;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
}

export async function observeOmegaFireIfNeeded(
  supabase: SupabaseClient,
  payload: SignalInsertPayload,
): Promise<AlphaOmegaFireOutcome> {
  if (!isOmegaEnginePayload(payload)) return EMPTY_ALPHAOMEGA_FIRE_OUTCOME;
  return observeAlphaOmegaFire(supabase, payload);
}

export async function handleOmegaValidationFailure(
  args: OmegaValidationFailureArgs,
): Promise<void> {
  await args.supabase.from('bridge_trade_log').insert(
    args.buildTradeLogRow(
      args.payload,
      'BLOCKED',
      args.validationReason,
      null,
      null,
      0,
      undefined,
    ),
  );
  if (!isOmegaEnginePayload(args.payload)) return;
  await tryLaneBCrackAfterRSizeBlock(args);
}

async function tryLaneBCrackAfterRSizeBlock(
  args: OmegaValidationFailureArgs,
): Promise<void> {
  const engine = args.engines.find((row) => row.engine_id === 'omega');
  await maybeEnterLaneBOnRSizeBlockedCrack(
    {
      supabase: args.supabase,
      payload: args.payload,
      signalId: args.signalId,
      config: args.config,
      engine,
      fireOutcome: args.fireOutcome,
      decisionLatencyMs: args.decisionLatencyMs,
      cachedAccountEquity: args.cachedAccountEquity,
      openTradeCount: args.openTradeCount,
      buildTradeLogRow: args.buildTradeLogRow as never,
      attachOmegaAuditFields: args.attachOmegaAuditFields,
    },
    args.validationReason,
  );
}
