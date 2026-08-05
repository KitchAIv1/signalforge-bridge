/**
 * Place-only AMD-day gate: skip new AO entries on days the AMD detector
 * tagged AMD_FAILED, only for signals at/after the 10:31 UTC tag write.
 * Kill-switched via bridge_config alpha_omega_amd_day_gate_enabled (default OFF).
 * Fail-open on any amd_state read problem — never silent-block on infra blip.
 * Streak observe and exits are never touched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import {
  ALPHAOMEGA_AMD_DAY_GATE_BLOCKING_TAG,
  ALPHAOMEGA_AMD_DAY_GATE_ENABLED_CONFIG_KEY,
  ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
} from './alphaOmegaConstants.js';

export interface AmdDayGateInput {
  /** ISO timestamp at crack/entry decision. */
  entryAtIso: string;
  signalId?: string;
}

export interface AmdDayGateResult {
  /** Kill switch currently ON. */
  enabled: boolean;
  /** Predicate matched (independent of kill switch). */
  wouldSkip: boolean;
  /** Block place when enabled && wouldSkip. */
  shouldBlock: boolean;
  blockReason: string | null;
  shadowAdvisory: string | null;
}

const GATE_PASS: Omit<AmdDayGateResult, 'enabled'> = {
  wouldSkip: false,
  shouldBlock: false,
  blockReason: null,
  shadowAdvisory: null,
};

/** Defaults to false on missing row/error — safe by construction. */
export async function isAlphaOmegaAmdDayGateEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_AMD_DAY_GATE_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}

interface AmdDayTagRow {
  amdTag: string | null;
  tagWrittenAtMs: number;
}

/**
 * Load today's automated AMD tag and its write time. Uses amd_tag (written
 * once by the 10:31 UTC detector; startup reruns refuse to overwrite), NOT
 * the manual override, so the gate stays causal.
 */
async function loadAmdDayTag(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<AmdDayTagRow | null> {
  const { data, error } = await supabase
    .from('amd_state')
    .select('amd_tag,created_at')
    .eq('trade_date', tradeDate)
    .maybeSingle();
  if (error) {
    logWarn('[AlphaOmega] AMD-day gate amd_state load failed (fail-open)', {
      error: error.message,
      tradeDate,
    });
    return null;
  }
  if (!data) return null;
  const tagWrittenAtMs = Date.parse(String(data.created_at ?? ''));
  if (!Number.isFinite(tagWrittenAtMs)) return null;
  return {
    amdTag: data.amd_tag != null ? String(data.amd_tag) : null,
    tagWrittenAtMs,
  };
}

/**
 * Evaluate the AMD-day gate for a place path that already passed the sync
 * entry gate. When disabled but would skip → returns shadow advisory so the
 * blocked-row path can log it for forensics.
 */
export async function evaluateAlphaOmegaAmdDayGate(
  supabase: SupabaseClient,
  input: AmdDayGateInput,
): Promise<AmdDayGateResult> {
  const enabled = await isAlphaOmegaAmdDayGateEnabled(supabase);

  const entryMs = Date.parse(input.entryAtIso);
  if (!Number.isFinite(entryMs)) return { enabled, ...GATE_PASS };

  const tradeDate = input.entryAtIso.slice(0, 10);
  const tagRow = await loadAmdDayTag(supabase, tradeDate);
  if (tagRow == null) return { enabled, ...GATE_PASS };

  const isBlockingTag = tagRow.amdTag === ALPHAOMEGA_AMD_DAY_GATE_BLOCKING_TAG;
  const tagKnownAtEntry = entryMs >= tagRow.tagWrittenAtMs;
  const wouldSkip = isBlockingTag && tagKnownAtEntry;
  if (!wouldSkip) return { enabled, ...GATE_PASS };

  const shadowAdvisory = `AMD_DAY_GATE:tag=${tagRow.amdTag}:taggedAt=${new Date(
    tagRow.tagWrittenAtMs,
  ).toISOString()}:${enabled ? 'block' : 'would_skip'}`;

  if (!enabled) {
    logInfo('[AlphaOmega] AMD-day gate would_skip (kill switch OFF)', {
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

  logInfo('[AlphaOmega] AMD-day gate BLOCK (kill switch ON)', {
    signalId: input.signalId ?? null,
    advisory: shadowAdvisory,
  });
  return {
    enabled: true,
    wouldSkip: true,
    shouldBlock: true,
    blockReason: ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
    shadowAdvisory,
  };
}
