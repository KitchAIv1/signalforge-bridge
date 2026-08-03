/**
 * Place-only toxic-crack skip (shallow + refuse-tape).
 * Kill-switched via bridge_config alpha_omega_toxic_crack_skip_enabled (default OFF).
 * Fail-open on fire-stream errors — never silent-block on infra blip.
 * Streak observe is never touched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_BLOCK_TOXIC_CRACK,
  ALPHAOMEGA_TOXIC_CRACK_SKIP_ENABLED_CONFIG_KEY,
  OMEGA_LANE_B_BROKER_ID,
} from './alphaOmegaConstants.js';
import {
  buildRefuseTapeContext,
  formatToxicCrackAdvisory,
  shouldSkipToxicCrack,
  TOXIC_CRACK_PRE_WINDOW_MS,
  type ToxicCrackFireRow,
  type ToxicCrackGeometry,
} from './alphaOmegaToxicCrackFeatures.js';

export interface ToxicCrackSkipInput {
  foundingLength: number;
  foundingSpeedMin: number;
  confluence: number | null;
  /** ISO timestamp at crack/entry decision. */
  entryAtIso: string;
  signalId?: string;
}

export interface ToxicCrackSkipResult {
  /** Kill switch currently ON. */
  enabled: boolean;
  /** Predicate matched (independent of kill switch). */
  wouldSkip: boolean;
  /** Block place when enabled && wouldSkip. */
  shouldBlock: boolean;
  blockReason: string | null;
  shadowAdvisory: string | null;
}

/** Defaults to false on missing row/error — safe by construction. */
export async function isAlphaOmegaToxicCrackSkipEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_TOXIC_CRACK_SKIP_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

async function loadRecentLaneBFires(
  supabase: SupabaseClient,
  entryAtIso: string,
): Promise<ToxicCrackFireRow[] | null> {
  const entryMs = Date.parse(entryAtIso);
  if (!Number.isFinite(entryMs)) return null;
  const fromIso = new Date(entryMs - TOXIC_CRACK_PRE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('created_at,decision,block_reason,confluence_score')
    .eq('engine_id', 'omega')
    .eq('broker_id', OMEGA_LANE_B_BROKER_ID)
    .gte('created_at', fromIso)
    .lt('created_at', entryAtIso)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    logWarn('[AlphaOmega] toxic-crack fire stream load failed (fail-open)', {
      error: error.message,
    });
    return null;
  }
  return (data ?? []).map((row) => ({
    createdAt: String(row.created_at),
    decision: String(row.decision ?? ''),
    blockReason: row.block_reason != null ? String(row.block_reason) : null,
    confluence: row.confluence_score != null ? Number(row.confluence_score) : null,
  }));
}

/**
 * Evaluate toxic-crack skip for a place path that already passed the sync entry gate.
 * When disabled but would skip → logs shadow advisory (Phase 3 forensics).
 */
export async function evaluateToxicCrackSkip(
  supabase: SupabaseClient,
  input: ToxicCrackSkipInput,
): Promise<ToxicCrackSkipResult> {
  const enabled = await isAlphaOmegaToxicCrackSkipEnabled(supabase);
  const geometry: ToxicCrackGeometry = {
    foundingLength: input.foundingLength,
    foundingSpeedMin: input.foundingSpeedMin,
    confluence: input.confluence,
  };

  const fires = await loadRecentLaneBFires(supabase, input.entryAtIso);
  if (fires == null) {
    return {
      enabled,
      wouldSkip: false,
      shouldBlock: false,
      blockReason: null,
      shadowAdvisory: null,
    };
  }

  const context = buildRefuseTapeContext(fires, input.entryAtIso);
  const wouldSkip = shouldSkipToxicCrack(geometry, context);

  if (!wouldSkip) {
    return {
      enabled,
      wouldSkip: false,
      shouldBlock: false,
      blockReason: null,
      shadowAdvisory: null,
    };
  }

  if (!enabled) {
    const shadowAdvisory = formatToxicCrackAdvisory(geometry, context, 'would_skip');
    logInfo('[AlphaOmega] toxic-crack would_skip (kill switch OFF)', {
      signalId: input.signalId ?? null,
      advisory: shadowAdvisory,
    });
    return {
      enabled: false,
      wouldSkip: true,
      shouldBlock: false,
      blockReason: null,
      shadowAdvisory,
    };
  }

  const shadowAdvisory = formatToxicCrackAdvisory(geometry, context, 'block');
  logInfo('[AlphaOmega] toxic-crack BLOCK (kill switch ON)', {
    signalId: input.signalId ?? null,
    advisory: shadowAdvisory,
  });
  return {
    enabled: true,
    wouldSkip: true,
    shouldBlock: true,
    blockReason: ALPHAOMEGA_BLOCK_TOXIC_CRACK,
    shadowAdvisory,
  };
}
