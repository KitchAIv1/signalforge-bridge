/**
 * Omega signals.execution_tier whitelist — unknown tiers must never fall through
 * to Trail/RAW fan-out (accidental broker orders).
 */

import type { SignalInsertPayload } from '../../connectors/supabase.js';
import {
  ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
  ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER,
  ALPHAOMEGA_UNKNOWN_EXECUTION_TIER_REASON,
} from './alphaOmegaConstants.js';
import { isOmegaEnginePayload } from './alphaOmegaFireIdentity.js';

export type OmegaExecutionTierRoute =
  | 'full_path'
  | 'ao_observe'
  | 'ao_shadow_over'
  | 'unknown_tier';

export function readSignalExecutionTier(
  payload: SignalInsertPayload,
): string | null {
  const raw = (payload as Record<string, unknown>).execution_tier;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toLowerCase();
}

/**
 * Classify omega execution_tier. Non-omega → full_path (tier ignored).
 * Missing/null tier on omega keeps today's Trail path (legacy inserts).
 */
export function classifyOmegaExecutionTier(
  payload: SignalInsertPayload,
): OmegaExecutionTierRoute {
  if (!isOmegaEnginePayload(payload)) return 'full_path';
  const tier = readSignalExecutionTier(payload);
  if (tier == null || tier === 'full') return 'full_path';
  if (tier === ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER) return 'ao_observe';
  if (tier === ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER) return 'ao_shadow_over';
  return 'unknown_tier';
}

export function isAoObserveOnlyPayload(payload: SignalInsertPayload): boolean {
  return classifyOmegaExecutionTier(payload) === 'ao_observe';
}

export function isAoShadowOverPayload(payload: SignalInsertPayload): boolean {
  return classifyOmegaExecutionTier(payload) === 'ao_shadow_over';
}

export function isUnknownOmegaExecutionTier(payload: SignalInsertPayload): boolean {
  return classifyOmegaExecutionTier(payload) === 'unknown_tier';
}

export { ALPHAOMEGA_UNKNOWN_EXECUTION_TIER_REASON };
